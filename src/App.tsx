import { NostrProvider, useNostr } from "./providers/NostrProvider";
import { AppShell } from "./components/layout/AppShell";
import { ArrowBigUp, ArrowBigDown, MessageSquare, Share2, MoreHorizontal, Loader2, Edit3, Trash2, AlertCircle } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { ProfilePage } from "./pages/ProfilePage";
import { SearchPage } from "./pages/SearchPage";
import { ExplorePage } from "./pages/ExplorePage";
import { RelayManagementPage } from "./pages/RelayManagementPage";
import { CommunitiesPage } from "./pages/CommunitiesPage";
import { CommunityDetailPage } from "./pages/CommunityDetailPage";
import { PostDetailPage } from "./pages/PostDetailPage";
import { SavePostButton } from "./components/SavePostButton";
import { ZapButton } from "./components/ZapButton";
import { CreatePost } from "./components/CreatePost";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { InfiniteScroll } from "./components/InfiniteScroll";
import { PostContent } from "./components/PostContent";
import { ToastContainer } from "./components/Toast";
import { useVoting } from "./hooks/useVoting";
import { useFollows } from "./hooks/useFollows";
import { useRateLimit } from "./hooks/useRateLimit";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { logger } from "./lib/logger";
import { useToast } from "./lib/toast";

import { NDKProfile } from "./lib/types";

function Feed() {
  const { ndk, user } = useNostr();
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [posts, setPosts] = useState<NDKEvent[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [postActionMenuOpen, setPostActionMenuOpen] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<Record<string, NDKProfile>>({});
  const [commentCounts] = useState<Record<string, number>>({});
  const [sortBy, setSortBy] = useState<"hot" | "new" | "top">("new");
  const [feedFilter, setFeedFilter] = useState<"all" | "following">("all");
  
  // Communities for post creation
  const [myCommunities, setMyCommunities] = useState<Array<{id: string, pubkey: string, name: string, atag: string}>>([]);
  
  // Fetch user's communities
  useEffect(() => {
    if (!user || !ndk) {
      setMyCommunities([]);
      return;
    }

    let sub: ReturnType<typeof ndk.subscribe> | null = null;
    let isActive = true;

    const fetchCommunities = async () => {
      try {
        // Fetch communities from user's membership list (kind 30001)
        sub = ndk.subscribe(
          {
            kinds: [30001],
            authors: [user.pubkey],
            "#d": ["communities"]
          },
          { closeOnEose: true }
        );

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

          const communityRefs = latestEvent.tags
            .filter(t => t[0] === "a")
            .map(t => t[1])
            .filter(atag => atag.startsWith("34550:"));

          const communityEntries = await Promise.all(
            communityRefs.map(async (atag) => {
              const [, pubkey, id] = atag.split(":");
              const community = await ndk.fetchEvent({
                kinds: [34550 as any],
                authors: [pubkey],
                "#d": [id]
              });

              if (!community) return null;
              const name = community.tags.find(t => t[0] === "name")?.[1] || "Unnamed";
              return { id, pubkey, name, atag };
            })
          );

          const uniqueEntries = communityEntries.filter(
            (entry): entry is { id: string; pubkey: string; name: string; atag: string } => Boolean(entry)
          );

          setMyCommunities(uniqueEntries);
        });
      } catch (error) {
        logger.error("Failed to fetch communities", error);
      }
    };

    fetchCommunities();

    return () => {
      isActive = false;
      if (sub) {
        sub.stop();
      }
    };
  }, [ndk, user]);
  
  // Pull to refresh
  const { isPulling, pullDistance, isRefreshing } = usePullToRefresh(async () => {
    seenEventIds.current.clear();
    setUntil(undefined);
    await loadPosts();
  });
  
  // Infinite scroll state
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [until, setUntil] = useState<number | undefined>(undefined);
  const POSTS_PER_PAGE = 20;

  // Get following list for filtering
  const { following } = useFollows();

  // Voting - use the custom hook instead of duplicating logic
  const { reactions, userVotes, votingIds, error: votingError, handleReaction, processIncomingReaction, processIncomingDeletion } = useVoting();

  const seenEventIds = useRef(new Set<string>());
  const profileFetchQueue = useRef(new Set<string>());

  const fetchProfile = useCallback(async (pubkey: string) => {
    if (profiles[pubkey] || profileFetchQueue.current.has(pubkey)) return;
    profileFetchQueue.current.add(pubkey);

    try {
      const profile = await ndk.getUser({ pubkey }).fetchProfile();
      if (profile) {
        setProfiles(prev => ({ ...prev, [pubkey]: profile }));
      }
    } catch (e) {
      logger.error("Failed to fetch profile:", pubkey, e);
    }
  }, [ndk, profiles]);

  // Initial fetch
  useEffect(() => {
    loadPosts();
    
    // Subscribe to real-time updates
    const postSub = ndk.subscribe(
      { kinds: [NDKKind.Text], limit: 10 },
      { closeOnEose: false }
    );

    postSub.on("event", (event: NDKEvent) => {
      if (seenEventIds.current.has(event.id)) return;
      seenEventIds.current.add(event.id);
      
      fetchProfile(event.pubkey);
      
      setPosts(prev => {
        const exists = prev.find(p => p.id === event.id);
        if (exists) return prev;
        const newPosts = [event, ...prev];
        return sortPosts(newPosts, sortBy);
      });

      subscribeToReactions(event.id);
    });

    return () => {
      postSub.stop();
    };
  }, [ndk, sortBy]);

  const subscribeToReactions = (postId: string) => {
    ndk.subscribe(
      { kinds: [NDKKind.Reaction], "#e": [postId] },
      { closeOnEose: true }
    ).on("event", (reactionEvent: NDKEvent) => {
      if (seenEventIds.current.has(reactionEvent.id)) return;
      seenEventIds.current.add(reactionEvent.id);
      processIncomingReaction(reactionEvent);
    });
    
    ndk.subscribe(
      { kinds: [5], "#e": [postId] },
      { closeOnEose: true }
    ).on("event", (deletionEvent: NDKEvent) => {
      processIncomingDeletion(deletionEvent);
    });
  };

  const loadPosts = async (loadMore = false) => {
    if (loadMore) {
      setIsLoadingMore(true);
    }

    try {
      const filter: any = { 
        kinds: [NDKKind.Text], 
        limit: POSTS_PER_PAGE 
      };
      
      // Filter by following if selected
      if (feedFilter === "following" && following.size > 0) {
        filter.authors = Array.from(following);
      }
      
      if (loadMore && until) {
        filter.until = until - 1;
      }

      const fetchedEvents = await ndk.fetchEvents(filter, { closeOnEose: true });
      
      const uniqueEvents = Array.from(fetchedEvents)
        .filter(event => {
          if (seenEventIds.current.has(event.id)) return false;
          seenEventIds.current.add(event.id);
          return true;
        })
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

      if (uniqueEvents.length === 0) {
        setHasMore(false);
      } else {
        setUntil(uniqueEvents[uniqueEvents.length - 1].created_at);
        
        uniqueEvents.forEach(event => {
          fetchProfile(event.pubkey);
          subscribeToReactions(event.id);
        });
        
        setPosts(prev => {
          const combined = loadMore ? [...prev, ...uniqueEvents] : uniqueEvents;
          return sortPosts(combined, sortBy);
        });
        
        setHasMore(uniqueEvents.length >= POSTS_PER_PAGE);
      }
    } catch (error) {
      logger.error("Failed to fetch posts:", error);
      showError("Failed to load posts. Please check your connection.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      loadPosts(true);
    }
  };

  const sortPosts = (postList: NDKEvent[], sort: "hot" | "new" | "top"): NDKEvent[] => {
    return [...postList].sort((a, b) => {
      if (sort === "new") {
        return (b.created_at || 0) - (a.created_at || 0);
      } else if (sort === "top") {
        const scoreA = reactions[a.id] || 0;
        const scoreB = reactions[b.id] || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (b.created_at || 0) - (a.created_at || 0);
      } else {
        const scoreA = reactions[a.id] || 0;
        const scoreB = reactions[b.id] || 0;
        const ageA = Date.now() / 1000 - (a.created_at || 0);
        const ageB = Date.now() / 1000 - (b.created_at || 0);
        const hotA = scoreA / Math.log(ageA + 2);
        const hotB = scoreB / Math.log(ageB + 2);
        return hotB - hotA;
      }
    });
  };

  useEffect(() => {
    setPosts(prev => sortPosts(prev, sortBy));
  }, [sortBy, reactions]);

  const handleVote = (post: NDKEvent, type: "UPVOTE" | "DOWNVOTE") => {
    handleReaction(post, type);
  };

  // Rate limiting for replies
  const { checkRateLimit: checkReplyRateLimit } = useRateLimit("replying", {
    maxAttempts: 5,
    windowMs: 60000, // 5 replies per minute
    cooldownMs: 30000,
  });

  const [isReplyPublishing, setIsReplyPublishing] = useState(false);

  const handleReply = async (post: NDKEvent) => {
    if (!replyContent.trim() || !user || isReplyPublishing) return;
    
    // Check rate limit
    if (!checkReplyRateLimit()) return;

    setIsReplyPublishing(true);
    try {
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;
      event.content = replyContent;
      
      const rootTag = post.tags.find(t => t[0] === "e" && t[3] === "root") || post.tags.find(t => t[0] === "e");
      const rootId = rootTag ? rootTag[1] : post.id;

      event.tags = [
        ["e", rootId, "", "root"],
        ["e", post.id, "", "reply"],
        ["p", post.pubkey],
        ["t", "nostr"]
      ];
      
      await event.publish();
      setReplyContent("");
      setReplyingTo(null);
    } catch (error) {
      logger.error("Failed to publish reply", error);
      showError("Failed to publish reply. Please try again.");
    } finally {
      setIsReplyPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Post Area */}
      {user && (
        <CreatePost
          communities={myCommunities}
          onPostCreated={() => {
            // Refresh posts after creating
            seenEventIds.current.clear();
            setUntil(undefined);
            loadPosts();
          }}
        />
      )}

      {/* Posts with Infinite Scroll */}
      {/* Pull to refresh indicator */}
      {isPulling && (
        <div
          className="flex flex-col items-center justify-center py-4 transition-all"
          style={{ transform: `translateY(${Math.min(pullDistance / 2, 40)}px)` }}
        >
          <Loader2
            size={24}
            className={`text-[var(--primary)] transition-all ${isRefreshing ? "animate-spin" : ""}`}
            style={{ opacity: Math.min(pullDistance / 60, 1) }}
          />
          <span className="text-xs text-muted-foreground mt-1">
            {isRefreshing ? "Refreshing..." : "Pull to refresh"}
          </span>
        </div>
      )}
      <div className="space-y-4">
        {votingError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertCircle size={16} />
            <span>{votingError}</span>
          </div>
        )}
        
        {posts.length === 0 && !isLoadingMore && (
          <div className="relative overflow-hidden bg-gradient-to-br from-[var(--primary)] to-[var(--primary-light)] rounded-2xl p-6 sm:p-8 text-white shadow-lg">
            <div className="relative z-10">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tighter mb-2">The Relay is Quiet...</h1>
              <p className="text-white/80 text-sm sm:text-base max-w-xl leading-relaxed">
                Successfully connected to ws://localhost:4433. Be the first to start the conversation on your local relay!
              </p>
            </div>
          </div>
        )}
      
        {/* Sorting and Feed Filter Controls */}
        {posts.length > 0 && (
          <div className="flex items-center justify-between bg-card border rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-4">
              {/* Feed Filter */}
              {user && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-400">Feed:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setFeedFilter("all");
                        setPosts([]);
                        seenEventIds.current.clear();
                        setUntil(undefined);
                        loadPosts();
                      }}
                      className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                        feedFilter === "all"
                          ? "bg-[var(--primary)] text-white"
                          : "bg-accent/50 text-gray-400 hover:bg-accent"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => {
                        setFeedFilter("following");
                        setPosts([]);
                        seenEventIds.current.clear();
                        setUntil(undefined);
                        loadPosts();
                      }}
                      className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                        feedFilter === "following"
                          ? "bg-[var(--primary)] text-white"
                          : "bg-accent/50 text-gray-400 hover:bg-accent"
                      }`}
                    >
                      Following
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-400">Sort:</span>
              <div className="flex items-center gap-1">
                {(["hot", "new", "top"] as const).map((sort) => (
                  <button
                    key={sort}
                    onClick={() => setSortBy(sort)}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold capitalize transition-all ${
                      sortBy === sort
                        ? "bg-[var(--primary)] text-white"
                        : "bg-accent/50 text-gray-400 hover:bg-accent"
                    }`}
                  >
                    {sort}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      
        <InfiniteScroll
          onLoadMore={loadMore}
          hasMore={hasMore}
          isLoading={isLoadingMore}
        >
          <div className="flex flex-col space-y-2">
            {posts.map((post) => (
              <article 
                key={post.id} 
                className="bg-card border border-border/50 hover:border-[var(--primary)]/30 transition-colors group cursor-pointer"
                onClick={() => navigate(`/post/${post.id}`)}
              >
                <div className="flex">
                  {/* Voting column - Reddit style */}
                  <div className="w-10 bg-accent/20 flex flex-col items-center py-2 space-y-0.5">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVote(post, "UPVOTE");
                      }}
                      disabled={votingIds.has(post.id)}
                      className={`p-1 rounded transition-colors ${userVotes[post.id] === "UPVOTE" ? "text-[var(--primary)]" : "text-muted-foreground hover:bg-accent hover:text-[var(--primary)]"} ${votingIds.has(post.id) ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <ArrowBigUp size={22} fill={userVotes[post.id] === "UPVOTE" ? "currentColor" : "none"} />
                    </button>
                    <span className={`text-xs font-bold ${
                      userVotes[post.id] === "UPVOTE" ? "text-[var(--primary)]" : 
                      userVotes[post.id] === "DOWNVOTE" ? "text-blue-600" : "text-muted-foreground"
                    }`}>
                      {reactions[post.id] || 0}
                    </span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVote(post, "DOWNVOTE");
                      }}
                      disabled={votingIds.has(post.id)}
                      className={`p-1 rounded transition-colors ${userVotes[post.id] === "DOWNVOTE" ? "text-blue-600" : "text-muted-foreground hover:bg-accent hover:text-blue-600"} ${votingIds.has(post.id) ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <ArrowBigDown size={22} fill={userVotes[post.id] === "DOWNVOTE" ? "currentColor" : "none"} />
                    </button>
                  </div>
                  
                  {/* Content column */}
                  <div className="flex-1 p-3 min-w-0">
                    {/* Post header - metadata */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <span className="font-bold text-foreground/80 hover:underline">r/nostr</span>
                      <span>•</span>
                      <span className="hover:underline">Posted by</span>
                      <span className="hover:underline text-foreground/60">
                        {profiles[post.pubkey]?.displayName || profiles[post.pubkey]?.name || `npub...${post.pubkey.slice(-8)}`}
                      </span>
                      <span>•</span>
                      <span>{new Date(post.created_at! * 1000).toLocaleDateString()}</span>
                    </div>
                    
                    {/* Post content */}
                    <div className="mb-3">
                      <PostContent content={post.content} maxLines={6} />
                    </div>

                    {/* Action bar - Reddit style */}
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/post/${post.id}`);
                        }}
                        className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground text-xs font-bold"
                      >
                        <MessageSquare size={16} />
                        <span>
                          {commentCounts[post.id] ? `${commentCounts[post.id]} comments` : "0 comments"}
                        </span>
                      </button>
                      
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplyingTo(replyingTo === post.id ? null : post.id);
                        }}
                        className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground text-xs font-bold"
                      >
                        <MessageSquare size={16} />
                        <span>Reply</span>
                      </button>
                      
                      <button 
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground text-xs font-bold"
                      >
                        <Share2 size={16} />
                        <span>Share</span>
                      </button>
                      
                      <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                        <SavePostButton post={post} size="sm" />
                      </div>
                      
                      <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                        <ZapButton 
                          targetPubkey={post.pubkey} 
                          eventId={post.id}
                          size="sm"
                        />
                      </div>
                      
                      {/* 3-dot menu */}
                      <div 
                        className="relative ml-auto" 
                        ref={postActionMenuOpen === post.id ? actionMenuRef : undefined}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button 
                          onClick={() => setPostActionMenuOpen(postActionMenuOpen === post.id ? null : post.id)}
                          className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        
                        {postActionMenuOpen === post.id && (
                          <div className="absolute right-0 bottom-full mb-1 w-36 bg-card border rounded-lg shadow-lg z-10 py-1">
                            {user?.pubkey === post.pubkey ? (
                              <>
                                <button
                                  onClick={() => {
                                    navigate(`/post/${post.id}`);
                                    setPostActionMenuOpen(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-accent flex items-center gap-2"
                                >
                                  <Edit3 size={12} />
                                  Edit Post
                                </button>
                                <button
                                  onClick={() => {
                                    alert("Delete coming soon - use post detail page");
                                    setPostActionMenuOpen(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-accent text-red-500 flex items-center gap-2"
                                >
                                  <Trash2 size={12} />
                                  Delete Post
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
                                  setPostActionMenuOpen(null);
                                }}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-accent flex items-center gap-2"
                              >
                                <Share2 size={12} />
                                Share Post
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Reply form */}
                    {replyingTo === post.id && (
                      <div className="mt-3 pt-3 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-2">
                          <textarea
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="What are your thoughts?"
                            className="w-full bg-background border border-border rounded-md p-2.5 text-sm focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)] min-h-[100px] resize-y"
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => setReplyingTo(null)}
                              className="px-4 py-1.5 text-xs font-bold hover:bg-accent rounded-full transition-colors"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => handleReply(post)}
                              disabled={!replyContent.trim() || isReplyPublishing}
                              className="flex items-center gap-2 px-4 py-1.5 bg-[var(--primary)] text-white rounded-full text-xs font-bold hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-colors"
                            >
                              {isReplyPublishing ? (
                                <>
                                  <Loader2 size={14} className="animate-spin" />
                                  Posting...
                                </>
                              ) : (
                                "Comment"
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </InfiniteScroll>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <NostrProvider>
        <Router>
          <AppShell>
            <ConnectionStatus />
            <ToastContainer />
            <Routes>
              <Route path="/" element={<Feed />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/post/:postId" element={<PostDetailPage />} />
              <Route path="/profile/:pubkey" element={<ProfilePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/relays" element={<RelayManagementPage />} />
              <Route path="/communities" element={<CommunitiesPage />} />
              <Route path="/community/:pubkey/:communityId" element={<CommunityDetailPage />} />
            </Routes>
          </AppShell>
        </Router>
      </NostrProvider>
    </ErrorBoundary>
  );
}

export default App;
