import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NDKEvent, NDKFilter, NDKKind } from "@nostr-dev-kit/ndk";
import { useNostr } from "../providers/NostrProvider";
import { useToast } from "../lib/toast";
import { useVoting } from "./useVoting";
import { useFollows } from "./useFollows";
import { useRateLimit } from "./useRateLimit";
import { usePullToRefresh } from "./usePullToRefresh";
import { useGlobalBlocks } from "./useGlobalBlocks";
import { logger } from "../lib/logger";
import { SubscriptionManager } from "../lib/subscriptionManager";
import { NDKProfile } from "../lib/types";

export type FeedSort = "hot" | "new" | "top";
export type FeedFilter = "all" | "following";
export type CommunityEntry = { id: string; pubkey: string; name: string; atag: string };

const COMMUNITY_KIND = 34550;
const COMMUNITY_LIST_KIND = 30001;
const MAX_PROFILE_CACHE_SIZE = 500;
const PUBKEY_REGEX = /^[0-9a-f]{64}$/i;
const COMMUNITY_SUBSCRIPTION_KEY = "feed:communities";
const FEED_STREAM_SUBSCRIPTION_KEY = "feed:stream";
const REACTION_SUBSCRIPTION_PREFIX = "feed:reaction:";
const POSTS_PER_PAGE = 20;
const FETCH_BATCH_SIZE = POSTS_PER_PAGE * 5;
const MAX_BATCHES_PER_REQUEST = 6;

function parseCommunityATag(rawTag: string | undefined): { atag: string; pubkey: string; id: string } | null {
  if (!rawTag) return null;
  const [kind, pubkey, id] = rawTag.split(":");
  if (kind !== String(COMMUNITY_KIND)) return null;
  if (!id || !PUBKEY_REGEX.test(pubkey || "")) return null;
  return { atag: rawTag, pubkey, id };
}

function getEventDedupKey(event: NDKEvent): string {
  if (event.id) return event.id;
  return `${event.pubkey}:${event.kind}:${event.created_at || 0}:${event.content}`;
}

function mergeUniquePosts(existing: NDKEvent[], incoming: NDKEvent[]): NDKEvent[] {
  const seen = new Set<string>();
  const merged: NDKEvent[] = [];

  for (const event of [...existing, ...incoming]) {
    const eventKey = getEventDedupKey(event);
    if (seen.has(eventKey)) continue;
    seen.add(eventKey);
    merged.push(event);
  }

  return merged;
}

export function useFeed() {
  const { ndk, user } = useNostr();
  const { error: showError, success } = useToast();

  const [posts, setPosts] = useState<NDKEvent[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [profiles, setProfiles] = useState<Record<string, NDKProfile>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [sortBy, setSortBy] = useState<FeedSort>("new");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [myCommunities, setMyCommunities] = useState<CommunityEntry[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isFilterExhausted, setIsFilterExhausted] = useState(false);
  const [until, setUntil] = useState<number | undefined>(undefined);
  const [isReplyPublishing, setIsReplyPublishing] = useState(false);

  const { following } = useFollows();
  const { blockedPubkeys } = useGlobalBlocks();
  const {
    reactions,
    userVotes,
    votingIds,
    error: votingError,
    handleReaction,
    processIncomingReaction,
    processIncomingDeletion,
  } = useVoting();
  const { checkRateLimit: checkReplyRateLimit } = useRateLimit("replying", {
    maxAttempts: 5,
    windowMs: 60000,
    cooldownMs: 30000,
  });

  const seenEventIds = useRef(new Set<string>());
  const profileFetchQueue = useRef(new Set<string>());
  const profilesRef = useRef<Record<string, NDKProfile>>({});
  const profileOrderRef = useRef<string[]>([]);
  const commentCountFetchQueue = useRef(new Set<string>());
  const emptyScanWindows = useRef(0);
  const blockedPubkeysRef = useRef(blockedPubkeys);
  const followingRef = useRef(following);
  const feedFilterRef = useRef(feedFilter);
  const untilRef = useRef<number | undefined>(undefined);
  const showErrorRef = useRef(showError);
  const subscriptionManagerRef = useRef(new SubscriptionManager());
  const loadPostsRequestRef = useRef(0);

  const isRedditLikePost = useCallback((event: NDKEvent): boolean => {
    const hasCommunityTag = event.tags.some(
      (tag) => tag[0] === "a" && (tag[1] || "").startsWith("34550:")
    );
    if (!hasCommunityTag) return false;

    const isThreadReply = event.tags.some(
      (tag) => tag[0] === "e" && (tag[3] === "root" || tag[3] === "reply")
    );
    return !isThreadReply;
  }, []);

  const isRedditLikeComment = useCallback((event: NDKEvent, rootPostId: string): boolean => {
    const rootTag = event.tags.find((tag) => tag[0] === "e" && tag[3] === "root");
    if (rootTag) return rootTag[1] === rootPostId;

    const hasThreadMarker = event.tags.some(
      (tag) => tag[0] === "e" && (tag[3] === "root" || tag[3] === "reply")
    );
    if (hasThreadMarker) return false;

    return event.tags.some((tag) => tag[0] === "e" && tag[1] === rootPostId);
  }, []);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    blockedPubkeysRef.current = blockedPubkeys;
  }, [blockedPubkeys]);

  useEffect(() => {
    followingRef.current = following;
  }, [following]);

  useEffect(() => {
    feedFilterRef.current = feedFilter;
  }, [feedFilter]);

  useEffect(() => {
    untilRef.current = until;
  }, [until]);

  useEffect(() => {
    showErrorRef.current = showError;
  }, [showError]);

  const fetchProfile = useCallback(
    async (pubkey: string) => {
      if (profilesRef.current[pubkey] || profileFetchQueue.current.has(pubkey)) return;
      profileFetchQueue.current.add(pubkey);

      try {
        const profile = await ndk.getUser({ pubkey }).fetchProfile();
        if (profile) {
          setProfiles((prev) => {
            if (prev[pubkey]) return prev;

            const nextProfiles = { ...prev, [pubkey]: profile };
            profileOrderRef.current.push(pubkey);

            if (profileOrderRef.current.length <= MAX_PROFILE_CACHE_SIZE) {
              return nextProfiles;
            }

            const oldestPubkey = profileOrderRef.current.shift();
            if (!oldestPubkey || oldestPubkey === pubkey) {
              return nextProfiles;
            }

            const { [oldestPubkey]: _evicted, ...trimmedProfiles } = nextProfiles;
            return trimmedProfiles;
          });
        }
      } catch (error) {
        logger.error("Failed to fetch profile:", pubkey, error);
      } finally {
        profileFetchQueue.current.delete(pubkey);
      }
    },
    [ndk]
  );

  const fetchCommentCount = useCallback(
    async (postId: string) => {
      if (commentCountFetchQueue.current.has(postId)) return;
      commentCountFetchQueue.current.add(postId);

      try {
        const comments = await ndk.fetchEvents(
          {
            kinds: [NDKKind.Text],
            "#e": [postId],
            limit: 500,
          },
          { closeOnEose: true }
        );

        const validComments = Array.from(comments).filter((event) => isRedditLikeComment(event, postId));
        setCommentCounts((prev) => ({ ...prev, [postId]: validComments.length }));
      } catch (error) {
        logger.error("Failed to fetch comment count:", postId, error);
      } finally {
        commentCountFetchQueue.current.delete(postId);
      }
    },
    [ndk, isRedditLikeComment]
  );

  const stopReactionSubscriptions = useCallback(() => {
    subscriptionManagerRef.current.stopMatching((key) => key.startsWith(REACTION_SUBSCRIPTION_PREFIX));
  }, []);

  const subscribeToReactions = useCallback(
    (postId: string) => {
      const subscriptionKey = `${REACTION_SUBSCRIPTION_PREFIX}${postId}`;
      if (subscriptionManagerRef.current.has(subscriptionKey)) return;

      const reactionSub = ndk.subscribe(
        { kinds: [NDKKind.Reaction], "#e": [postId] },
        { closeOnEose: true }
      );
      const deletionSub = ndk.subscribe(
        { kinds: [NDKKind.EventDeletion], "#e": [postId] },
        { closeOnEose: true }
      );
      subscriptionManagerRef.current.trackPairUntilEose(subscriptionKey, reactionSub, deletionSub);

      reactionSub.on("event", (reactionEvent: NDKEvent) => {
        const reactionKey = getEventDedupKey(reactionEvent);
        if (seenEventIds.current.has(reactionKey)) return;
        seenEventIds.current.add(reactionKey);
        processIncomingReaction(reactionEvent);
      });

      deletionSub.on("event", (deletionEvent: NDKEvent) => {
        processIncomingDeletion(deletionEvent);
      });
    },
    [ndk, processIncomingReaction, processIncomingDeletion]
  );

  const loadPosts = useCallback(
    async (
      loadMore = false,
      selectedFeedFilter: FeedFilter = feedFilterRef.current,
      forceDeepScan = false
    ) => {
      const requestId = loadPostsRequestRef.current + 1;
      loadPostsRequestRef.current = requestId;
      const isStaleRequest = () => requestId !== loadPostsRequestRef.current;

      if (loadMore) {
        setIsLoadingMore(true);
      }

      try {
        const baseFilter: NDKFilter<number> = {
          kinds: [NDKKind.Text],
          limit: FETCH_BATCH_SIZE,
        };

        if (selectedFeedFilter === "following") {
          const followedAuthors = Array.from(followingRef.current).filter(
            (pubkey) => !blockedPubkeysRef.current.has(pubkey)
          );
          if (followedAuthors.length === 0) {
            if (isStaleRequest()) return;
            if (!loadMore) {
              setPosts([]);
            }
            emptyScanWindows.current = 0;
            setIsFilterExhausted(false);
            setHasMore(false);
            return;
          }

          baseFilter.authors = followedAuthors;
        }

        let scanUntil = loadMore ? untilRef.current : undefined;
        let oldestFetchedAt: number | undefined = scanUntil;
        let reachedEnd = false;
        let batchesScanned = 0;
        const scanBatchLimit = forceDeepScan ? MAX_BATCHES_PER_REQUEST * 4 : MAX_BATCHES_PER_REQUEST;
        const nextVisiblePosts: NDKEvent[] = [];

        while (batchesScanned < scanBatchLimit && nextVisiblePosts.length < POSTS_PER_PAGE) {
          if (isStaleRequest()) return;

          const filter: NDKFilter<number> = {
            ...baseFilter,
            ...(scanUntil ? { until: scanUntil - 1 } : {}),
          };

          const fetchedEvents = await ndk.fetchEvents(filter, { closeOnEose: true });
          if (isStaleRequest()) return;

          const fetchedEventList = Array.from(fetchedEvents).sort(
            (a, b) => (b.created_at || 0) - (a.created_at || 0)
          );

          if (fetchedEventList.length === 0) {
            reachedEnd = true;
            break;
          }

          const batchOldest = fetchedEventList[fetchedEventList.length - 1].created_at;
          if (!batchOldest) {
            reachedEnd = true;
            break;
          }

          oldestFetchedAt = batchOldest;
          scanUntil = batchOldest;
          batchesScanned += 1;

          const visibleInBatch = fetchedEventList.filter((event) => {
            if (blockedPubkeysRef.current.has(event.pubkey)) return false;
            if (!isRedditLikePost(event)) return false;
            const eventKey = getEventDedupKey(event);
            if (seenEventIds.current.has(eventKey)) return false;
            seenEventIds.current.add(eventKey);
            return true;
          });

          if (visibleInBatch.length > 0) {
            visibleInBatch.forEach((event) => {
              void fetchProfile(event.pubkey);
              subscribeToReactions(event.id);
              void fetchCommentCount(event.id);
            });
            nextVisiblePosts.push(...visibleInBatch);
          }

          if (fetchedEventList.length < FETCH_BATCH_SIZE) {
            reachedEnd = true;
            break;
          }
        }

        if (isStaleRequest()) return;

        if (oldestFetchedAt) {
          untilRef.current = oldestFetchedAt;
          setUntil(oldestFetchedAt);
        }

        if (nextVisiblePosts.length > 0) {
          emptyScanWindows.current = 0;
          setIsFilterExhausted(false);
          setPosts((prev) => (loadMore ? mergeUniquePosts(prev, nextVisiblePosts) : mergeUniquePosts([], nextVisiblePosts)));
        } else if (!loadMore) {
          setPosts([]);
        }

        if (forceDeepScan && nextVisiblePosts.length === 0 && !reachedEnd) {
          setIsFilterExhausted(true);
          setHasMore(false);
          return;
        }

        if (!forceDeepScan && nextVisiblePosts.length === 0 && !reachedEnd) {
          emptyScanWindows.current += 1;
        }

        const exhaustedByFiltering = !forceDeepScan && emptyScanWindows.current >= 3;
        setIsFilterExhausted(exhaustedByFiltering);
        setHasMore(!reachedEnd && !exhaustedByFiltering && Boolean(oldestFetchedAt));
      } catch (error) {
        if (isStaleRequest()) return;
        logger.error("Failed to fetch posts:", error);
        showErrorRef.current("Failed to load posts. Please check your connection.");
      } finally {
        if (!isStaleRequest()) {
          setIsLoadingMore(false);
        }
      }
    },
    [ndk, fetchProfile, fetchCommentCount, isRedditLikePost, subscribeToReactions]
  );

  const refreshFeed = useCallback(async () => {
    stopReactionSubscriptions();
    seenEventIds.current.clear();
    emptyScanWindows.current = 0;
    setIsFilterExhausted(false);
    untilRef.current = undefined;
    setUntil(undefined);
    setHasMore(true);
    await loadPosts(false, feedFilterRef.current);
  }, [loadPosts, stopReactionSubscriptions]);

  const { isPulling, pullDistance, isRefreshing } = usePullToRefresh(refreshFeed);

  useEffect(() => {
    if (!user || !ndk) {
      setMyCommunities([]);
      return;
    }

    let isActive = true;

    const fetchCommunities = async () => {
      try {
        const membershipFilter: NDKFilter<number> = {
          kinds: [COMMUNITY_LIST_KIND],
          authors: [user.pubkey],
          "#d": ["communities"],
        };
        const sub = ndk.subscribe(membershipFilter, { closeOnEose: true });
        subscriptionManagerRef.current.replace(COMMUNITY_SUBSCRIPTION_KEY, sub);

        let latestEvent: NDKEvent | null = null;

        sub.on("event", (event) => {
          const createdAt = event.created_at || 0;
          if (!latestEvent || createdAt > (latestEvent.created_at || 0)) {
            latestEvent = event;
          }
        });

        sub.on("eose", async () => {
          if (!isActive) return;
          if (!latestEvent) {
            setMyCommunities([]);
            return;
          }

          const parsedRefs = latestEvent.tags
            .map((tag) => (tag[0] === "a" ? parseCommunityATag(tag[1]) : null))
            .filter((entry): entry is { atag: string; pubkey: string; id: string } => Boolean(entry));

          const uniqueRefs = Array.from(
            parsedRefs.reduce(
              (acc, entry) => acc.set(entry.atag, entry),
              new Map<string, { atag: string; pubkey: string; id: string }>()
            ).values()
          );

          const communityEntries = await Promise.all(
            uniqueRefs.map(async ({ atag, pubkey, id }) => {
              const communityFilter: NDKFilter<number> = {
                kinds: [COMMUNITY_KIND],
                authors: [pubkey],
                "#d": [id],
              };
              const community = await ndk.fetchEvent(communityFilter);
              if (!community) return null;

              const name = community.tags.find((tag) => tag[0] === "name")?.[1] || "Unnamed";
              return { id, pubkey, name, atag };
            })
          );

          if (!isActive) return;
          setMyCommunities(communityEntries.filter((entry): entry is CommunityEntry => Boolean(entry)));
        });
      } catch (error) {
        logger.error("Failed to fetch communities", error);
      }
    };

    void fetchCommunities();

    return () => {
      isActive = false;
      subscriptionManagerRef.current.stop(COMMUNITY_SUBSCRIPTION_KEY);
    };
  }, [ndk, user]);

  useEffect(() => {
    let isActive = true;

    const startFeed = async () => {
      await loadPosts(false, feedFilterRef.current);
      if (!isActive) return;

      const postSub = ndk.subscribe({ kinds: [NDKKind.Text], limit: 10 }, { closeOnEose: false });
      subscriptionManagerRef.current.replace(FEED_STREAM_SUBSCRIPTION_KEY, postSub);

      postSub.on("event", (event: NDKEvent) => {
        if (!isActive) return;
        if (blockedPubkeysRef.current.has(event.pubkey)) return;
        if (!isRedditLikePost(event)) return;
        const eventKey = getEventDedupKey(event);
        if (seenEventIds.current.has(eventKey)) return;
        seenEventIds.current.add(eventKey);

        void fetchProfile(event.pubkey);
        setPosts((prev) => mergeUniquePosts([event], prev));

        subscribeToReactions(event.id);
        void fetchCommentCount(event.id);
      });
    };

    void startFeed();

    return () => {
      isActive = false;
      loadPostsRequestRef.current += 1;
      subscriptionManagerRef.current.stop(FEED_STREAM_SUBSCRIPTION_KEY);
      stopReactionSubscriptions();
    };
  }, [ndk, loadPosts, fetchProfile, fetchCommentCount, isRedditLikePost, subscribeToReactions, stopReactionSubscriptions]);

  const resetFeedAndLoad = useCallback(
    (nextFilter: FeedFilter) => {
      stopReactionSubscriptions();
      setFeedFilter(nextFilter);
      setPosts([]);
      setCommentCounts({});
      seenEventIds.current.clear();
      emptyScanWindows.current = 0;
      setIsFilterExhausted(false);
      untilRef.current = undefined;
      setUntil(undefined);
      setHasMore(true);
      void loadPosts(false, nextFilter);
    },
    [loadPosts, stopReactionSubscriptions]
  );

  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      void loadPosts(true);
    }
  }, [isLoadingMore, hasMore, loadPosts]);

  const loadOlderPosts = useCallback(() => {
    void loadPosts(true, feedFilterRef.current, true);
  }, [loadPosts]);

  const sortPosts = useCallback(
    (postList: NDKEvent[], sort: FeedSort): NDKEvent[] => {
      return [...postList].sort((a, b) => {
        if (sort === "new") {
          return (b.created_at || 0) - (a.created_at || 0);
        }
        if (sort === "top") {
          const scoreA = reactions[a.id] || 0;
          const scoreB = reactions[b.id] || 0;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return (b.created_at || 0) - (a.created_at || 0);
        }

        const scoreA = reactions[a.id] || 0;
        const scoreB = reactions[b.id] || 0;
        const ageA = Date.now() / 1000 - (a.created_at || 0);
        const ageB = Date.now() / 1000 - (b.created_at || 0);
        const hotA = scoreA / Math.log(ageA + 2);
        const hotB = scoreB / Math.log(ageB + 2);
        return hotB - hotA;
      });
    },
    [reactions]
  );

  const sortedPosts = useMemo(() => sortPosts(posts, sortBy), [posts, sortBy, sortPosts]);

  const handleVote = useCallback(
    (post: NDKEvent, type: "UPVOTE" | "DOWNVOTE") => {
      void handleReaction(post, type);
    },
    [handleReaction]
  );

  const toggleReply = useCallback((postId: string) => {
    setReplyingTo((current) => (current === postId ? null : postId));
  }, []);

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleReply = useCallback(
    async (post: NDKEvent) => {
      if (!replyContent.trim() || !user || isReplyPublishing) return;
      if (!checkReplyRateLimit()) return;

      setIsReplyPublishing(true);
      try {
        const event = new NDKEvent(ndk);
        event.kind = NDKKind.Text;
        event.content = replyContent;

        const rootTag = post.tags.find((tag) => tag[0] === "e" && tag[3] === "root") || post.tags.find((tag) => tag[0] === "e");
        const rootId = rootTag ? rootTag[1] : post.id;

        event.tags = [
          ["e", rootId, "", "root"],
          ["e", post.id, "", "reply"],
          ["p", post.pubkey],
          ["t", "nostr"],
        ];

        await event.publish();
        setReplyContent("");
        setReplyingTo(null);
        setCommentCounts((prev) => ({ ...prev, [post.id]: (prev[post.id] || 0) + 1 }));
      } catch (error) {
        logger.error("Failed to publish reply", error);
        showError("Failed to publish reply. Please try again.");
      } finally {
        setIsReplyPublishing(false);
      }
    },
    [replyContent, user, isReplyPublishing, checkReplyRateLimit, ndk, showError]
  );

  const handleEditPost = useCallback(
    async (postId: string, newContent: string) => {
      if (!user) return;
      const targetPost = posts.find((post) => post.id === postId);
      if (!targetPost) return;

      if (targetPost.pubkey !== user.pubkey) {
        showError("You can only edit your own posts");
        return;
      }

      const trimmedContent = newContent.trim();
      if (!trimmedContent || trimmedContent === targetPost.content.trim()) return;

      try {
        const deletion = new NDKEvent(ndk);
        deletion.kind = 5;
        deletion.content = "Post replaced by edited version";
        deletion.tags = [["e", targetPost.id]];
        await deletion.publish();

        const replacement = new NDKEvent(ndk);
        replacement.kind = NDKKind.Text;
        replacement.content = trimmedContent;
        replacement.tags = [
          ...targetPost.tags.filter((tag) => tag[0] !== "edited"),
          ["edited", targetPost.id, new Date().toISOString()],
        ];
        await replacement.publish();

        seenEventIds.current.delete(getEventDedupKey(targetPost));
        seenEventIds.current.add(getEventDedupKey(replacement));

        setPosts((prev) => prev.map((post) => (post.id === postId ? replacement : post)));
        setCommentCounts((prev) => {
          const next = { ...prev };
          delete next[postId];
          return next;
        });
        if (replyingTo === postId) {
          setReplyingTo(null);
        }

        void fetchProfile(replacement.pubkey);
        subscribeToReactions(replacement.id);
        void fetchCommentCount(replacement.id);

        success("Post edited");
      } catch (error) {
        logger.error("Failed to edit post", error);
        showError("Failed to edit post. Please try again.");
      }
    },
    [user, posts, ndk, replyingTo, fetchProfile, subscribeToReactions, fetchCommentCount, showError, success]
  );

  const handleDeletePost = useCallback(
    async (postId: string) => {
      if (!user) return;
      const targetPost = posts.find((post) => post.id === postId);
      if (!targetPost) return;

      if (targetPost.pubkey !== user.pubkey) {
        showError("You can only delete your own posts");
        return;
      }

      try {
        const deletion = new NDKEvent(ndk);
        deletion.kind = 5;
        deletion.content = "Deleted by author";
        deletion.tags = [["e", postId]];
        await deletion.publish();

        setPosts((prev) => prev.filter((post) => post.id !== postId));
        setCommentCounts((prev) => {
          const next = { ...prev };
          delete next[postId];
          return next;
        });
        if (replyingTo === postId) {
          setReplyingTo(null);
        }

        success("Post deleted");
      } catch (error) {
        logger.error("Failed to delete post", error);
        showError("Failed to delete post. Please try again.");
      }
    },
    [user, posts, ndk, replyingTo, showError, success]
  );

  return {
    user,
    myCommunities,
    sortedPosts,
    profiles,
    commentCounts,
    sortBy,
    setSortBy,
    feedFilter,
    votingError,
    reactions,
    userVotes,
    votingIds,
    replyingTo,
    replyContent,
    setReplyContent,
    isReplyPublishing,
    isLoadingMore,
    hasMore,
    isFilterExhausted,
    isPulling,
    pullDistance,
    isRefreshing,
    refreshFeed,
    resetFeedAndLoad,
    loadMore,
    loadOlderPosts,
    toggleReply,
    cancelReply,
    handleVote,
    handleReply,
    handleEditPost,
    handleDeletePost,
  };
}
