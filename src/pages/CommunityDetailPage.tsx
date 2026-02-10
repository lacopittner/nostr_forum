import { useNostr } from "../providers/NostrProvider";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { Edit2, ArrowLeft, Shield, Users, ArrowBigUp, ArrowBigDown, Gavel, UserPlus, UserCheck, Search, Book, AlertCircle, HelpCircle } from "lucide-react";
import { EditCommunityModal } from "../components/EditCommunityModal";
import { ManageModeratorsModal } from "../components/ManageModeratorsModal";
import { ManageBlockedUsersModal } from "../components/ManageBlockedUsersModal";
import { useCommunityBlocks } from "../hooks/useCommunityBlocks";
import { useCommunityMembership } from "../hooks/useCommunityMembership";
import { useGlobalBlocks } from "../hooks/useGlobalBlocks";
import { useVoting } from "../hooks/useVoting";
import { PostActionsMenu } from "../components/PostActionsMenu";
import { CommunityWikiModal } from "../components/CommunityWikiModal";
import { SavePostButton } from "../components/SavePostButton";
import { ZapButton } from "../components/ZapButton";
import { CreatePost } from "../components/CreatePost";
import { MarkdownContent } from "../components/MarkdownContent";
import { logger } from "../lib/logger";
import { useToast } from "../lib/toast";

const COMMUNITY_APPROVAL_KIND = 4550;
const COMMUNITY_BLOCK_KIND = 34551;

type ModerationStatus = "approved" | "rejected";

interface ParsedCommunitySearch {
  userFilters: string[];
  tagFilters: string[];
  textFilters: string[];
}

const unquoteSearchValue = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
};

const parseCommunitySearchQuery = (rawQuery: string): ParsedCommunitySearch => {
  const cleaned = rawQuery.replace(/[()]/g, " ").trim();
  if (!cleaned) {
    return { userFilters: [], tagFilters: [], textFilters: [] };
  }

  const userFilters: string[] = [];
  const tagFilters: string[] = [];
  const textFilters: string[] = [];

  // Supports:
  // - user:alice
  // - user:"alice dev"
  // - tag:test
  // - tag:"testing team"
  // - plain text with or without quotes
  const tokens = cleaned.match(/(?:[^\s"]+:"[^"]*"|[^\s"]+:[^\s]+|"[^"]*"|\S+)/g) ?? [];
  tokens.forEach((rawToken) => {
    const token = rawToken.trim();
    const lowered = token.toLowerCase();

    if (lowered.startsWith("user:")) {
      const value = unquoteSearchValue(token.slice(token.indexOf(":") + 1)).toLowerCase();
      if (value) userFilters.push(value);
      return;
    }

    // Support both tag:xxx and !tag:xxx syntax.
    if (lowered.startsWith("tag:") || lowered.startsWith("!tag:")) {
      const value = unquoteSearchValue(token.replace(/^!?tag:/i, "")).toLowerCase();
      if (value) tagFilters.push(value);
      return;
    }

    const textValue = unquoteSearchValue(token).toLowerCase();
    if (textValue) textFilters.push(textValue);
  });

  return { userFilters, tagFilters, textFilters };
};

const extractPostSearchTags = (post: NDKEvent): string[] => {
  const tagValues = post.tags
    .filter((tag) => tag[0] === "t" || tag[0] === "flair")
    .map((tag) => (tag[1] || "").toLowerCase())
    .filter(Boolean);

  const contentHashtags = Array.from(post.content.matchAll(/#([a-z0-9_-]+)/gi))
    .map((match) => match[1].toLowerCase())
    .filter(Boolean);

  return Array.from(new Set([...tagValues, ...contentHashtags]));
};

export function CommunityDetailPage() {
  const { ndk, user } = useNostr();
  const { pubkey, communityId } = useParams<{ pubkey: string; communityId: string }>();
  const navigate = useNavigate();
  const { error: showError, success } = useToast();
  const [community, setCommunity] = useState<NDKEvent | null>(null);
  const [posts, setPosts] = useState<NDKEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showModeratorsModal, setShowModeratorsModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showWikiModal, setShowWikiModal] = useState(false);
  const [showCreatePostForm, setShowCreatePostForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredPosts, setFilteredPosts] = useState<NDKEvent[]>([]);
  
  // Track edited posts
  const [editedPosts, setEditedPosts] = useState<Set<string>>(new Set());
  const [moderationState, setModerationState] = useState<Record<string, { status: ModerationStatus; createdAt: number }>>({});
  
  // Membership
  const { isMember, joinCommunity, leaveCommunity } = useCommunityMembership();
  const { blockedPubkeys, isBlocked } = useGlobalBlocks();
  const [isJoining, setIsJoining] = useState(false);
  
  // Voting - use the custom hook instead of duplicating logic
  const { reactions, userVotes, votingIds, error: votingError, handleReaction, processIncomingReaction, processIncomingDeletion } = useVoting();
  
  // Profile fetching
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const profileFetchQueue = useRef(new Set<string>());
  const authorNpubCache = useRef(new Map<string, string>());
  
  const seenPostIds = useRef(new Set<string>());
  
  // Block checking
  const { isCurrentUserBlocked } = useCommunityBlocks(community);
  
  // Check if user is moderator
  const isModerator = user ? (
    community?.pubkey === user.pubkey ||
    community?.tags.some(t => t[0] === "p" && t[1] === user.pubkey && t[3] === "moderator")
  ) : false;

  const isOwner = community && user && community.pubkey === user.pubkey;
  const hasJoined = community && isMember(community.pubkey, communityId || "");

  const handleJoinLeave = async () => {
    if (!user || !community || !communityId) return;
    
    setIsJoining(true);
    if (hasJoined) {
      await leaveCommunity(community.pubkey, communityId);
    } else {
      await joinCommunity(community.pubkey, communityId);
    }
    setIsJoining(false);
  };

  // Fetch profile helper
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
      // Silently fail - user pubkey will be displayed instead
    }
  }, [ndk, profiles]);

  const getAuthorNpub = useCallback((authorPubkey: string): string => {
    const cached = authorNpubCache.current.get(authorPubkey);
    if (cached !== undefined) return cached;

    try {
      const npub = ndk.getUser({ pubkey: authorPubkey }).npub.toLowerCase();
      authorNpubCache.current.set(authorPubkey, npub);
      return npub;
    } catch {
      authorNpubCache.current.set(authorPubkey, "");
      return "";
    }
  }, [ndk]);



  // Fetch community
  useEffect(() => {
    const fetchCommunity = async () => {
      if (!pubkey || !communityId) return;
      
      try {
        const sub = ndk.subscribe(
          { 
            kinds: [34550] as any,
            authors: [pubkey],
            "#d": [communityId]
          },
          { closeOnEose: true }
        );

        sub.on("event", (event: NDKEvent) => {
          setCommunity(event);
        });

        sub.on("eose", () => {
          setIsLoading(false);
        });
      } catch (error) {
        logger.error("Failed to fetch community", error); showError("Failed to load community. Please try again.");
        setIsLoading(false);
      }
    };

    fetchCommunity();
  }, [ndk, pubkey, communityId]);

  // Fetch posts in community
  useEffect(() => {
    if (!community) return;

    const communityATag = `34550:${pubkey}:${communityId}`;
    
    // Fetch posts
    const postSub = ndk.subscribe(
      { 
        kinds: [NDKKind.Text],
        "#a": [communityATag],
        limit: 50
      },
      { closeOnEose: false }
    );

    postSub.on("event", (event: NDKEvent) => {
      if (isBlocked(event.pubkey)) return;
      if (!seenPostIds.current.has(event.id)) {
        seenPostIds.current.add(event.id);
        fetchProfile(event.pubkey);
        setPosts(prev => [event, ...prev].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)));
        
        // Subscribe to reactions for this post
        ndk.subscribe(
          { kinds: [NDKKind.Reaction], "#e": [event.id] },
          { closeOnEose: true }
        ).on("event", (reactionEvent: NDKEvent) => {
          processIncomingReaction(reactionEvent);
        });
        
        // Subscribe to deletion events
        ndk.subscribe(
          { kinds: [5], "#e": [event.id] },
          { closeOnEose: true }
        ).on("event", (deletionEvent: NDKEvent) => {
          processIncomingDeletion(deletionEvent);
        });
      }
    });

    const moderationSub = ndk.subscribe(
      {
        kinds: [COMMUNITY_APPROVAL_KIND as any],
        "#a": [communityATag],
        limit: 500,
      },
      { closeOnEose: false }
    );

    moderationSub.on("event", (event: NDKEvent) => {
      const targetPostId = event.tags.find(t => t[0] === "e")?.[1];
      if (!targetPostId) return;

      const statusFromTag = event.tags.find(t => t[0] === "status")?.[1]?.toLowerCase();
      const statusFromContent = event.content?.trim().toLowerCase();
      const status = (statusFromTag || statusFromContent) === "rejected" ? "rejected" : "approved";
      const createdAt = event.created_at || 0;

      setModerationState(prev => {
        const existing = prev[targetPostId];
        if (existing && createdAt <= existing.createdAt) return prev;
        return {
          ...prev,
          [targetPostId]: { status, createdAt },
        };
      });
    });

    return () => {
      postSub.stop();
      moderationSub.stop();
    };
  }, [community, ndk, pubkey, communityId, fetchProfile, processIncomingReaction, processIncomingDeletion, isBlocked]);

  // Filter posts by search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPosts(posts.filter((post) => !blockedPubkeys.has(post.pubkey)));
      return;
    }

    const parsedQuery = parseCommunitySearchQuery(searchQuery);

    const filtered = posts.filter((post) => {
      if (blockedPubkeys.has(post.pubkey)) return false;

      const profile = profiles[post.pubkey] || {};
      const content = post.content.toLowerCase();
      const pubkey = post.pubkey.toLowerCase();
      const npub = getAuthorNpub(post.pubkey);
      const userSearchSpace = [
        pubkey,
        npub,
        (profile.name || "").toLowerCase(),
        (profile.displayName || "").toLowerCase(),
        (profile.display_name || "").toLowerCase(),
        (profile.nip05 || "").toLowerCase(),
      ]
        .filter(Boolean)
        .join(" ");

      const postTags = extractPostSearchTags(post);

      const userMatches = parsedQuery.userFilters.every((userTerm) =>
        userSearchSpace.includes(userTerm)
      );
      if (!userMatches) return false;

      const tagMatches = parsedQuery.tagFilters.every((tagTerm) =>
        postTags.some((tag) => tag === tagTerm || tag.includes(tagTerm))
      );
      if (!tagMatches) return false;

      const textSearchSpace = [content, ...postTags].join(" ");
      const textMatches = parsedQuery.textFilters.every((textTerm) =>
        textSearchSpace.includes(textTerm)
      );
      if (!textMatches) return false;

      return true;
    });

    setFilteredPosts(filtered);
  }, [searchQuery, posts, blockedPubkeys, profiles, getAuthorNpub]);

  const getPostModerationStatus = (postId: string): ModerationStatus | "pending" => {
    return moderationState[postId]?.status || "approved";
  };

  // Handle edit post
  const handleEditPost = async (postId: string, newContent: string) => {
    if (!user) return;
    const targetPost = posts.find(p => p.id === postId);
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
      const editedAt = new Date().toISOString();
      replacement.tags = [
        ...targetPost.tags.filter(tag => tag[0] !== "edited"),
        ["edited", targetPost.id, editedAt],
      ];
      await replacement.publish();

      seenPostIds.current.delete(targetPost.id);
      seenPostIds.current.add(replacement.id);

      setPosts(prev =>
        prev
          .map(p => (p.id === postId ? replacement : p))
          .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      );
      setFilteredPosts(prev =>
        prev
          .map(p => (p.id === postId ? replacement : p))
          .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      );

      setModerationState(prev => {
        const next = { ...prev };
        if (next[targetPost.id]) {
          next[replacement.id] = next[targetPost.id];
          delete next[targetPost.id];
        }
        return next;
      });

      setEditedPosts(prev => {
        const next = new Set(prev);
        next.delete(targetPost.id);
        next.add(replacement.id);
        return next;
      });

      success("Post edited");
    } catch (error) {
      logger.error("Failed to edit post", error);
      showError("Failed to edit post. Please try again.");
    }
  };

  // Handle delete post
  const handleDeletePost = async (postId: string) => {
    if (!user) return;
    const targetPost = posts.find(p => p.id === postId);
    if (!targetPost) return;
    const canDelete = targetPost.pubkey === user.pubkey || isModerator;
    if (!canDelete) {
      showError("You can only remove your own posts or moderate community posts");
      return;
    }
    
    try {
      const deletion = new NDKEvent(ndk);
      deletion.kind = 5;
      deletion.content = targetPost.pubkey === user.pubkey ? "Deleted by author" : "Removed by moderator";
      deletion.tags = [["e", postId]];
      
      await deletion.publish();
      
      // Remove from local state
      setPosts(prev => prev.filter(p => p.id !== postId));
      setFilteredPosts(prev => prev.filter(p => p.id !== postId));
      setModerationState(prev => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
      success(targetPost.pubkey === user.pubkey ? "Post deleted" : "Post removed");
    } catch (error) {
      logger.error("Failed to delete post", error);
      showError("Failed to delete post. Please try again.");
    }
  };

  const handleModeratePost = async (postId: string, status: ModerationStatus) => {
    if (!isModerator || !communityId || !pubkey) {
      showError("Only moderators can approve or reject posts");
      return;
    }

    const targetPost = posts.find(p => p.id === postId);
    if (!targetPost) return;

    try {
      const event = new NDKEvent(ndk);
      event.kind = COMMUNITY_APPROVAL_KIND as any;
      event.content = status;
      event.tags = [
        ["a", `34550:${pubkey}:${communityId}`],
        ["e", postId],
        ["p", targetPost.pubkey],
        ["status", status],
      ];

      await event.publish();

      const createdAt = event.created_at || Math.floor(Date.now() / 1000);
      setModerationState(prev => ({
        ...prev,
        [postId]: { status, createdAt },
      }));
      success(status === "approved" ? "Post approved" : "Post rejected");
    } catch (error) {
      logger.error("Failed to moderate post", error);
      showError("Failed to update moderation status");
    }
  };

  const handleBanUserFromPost = async (targetPubkey: string) => {
    if (!isModerator || !community || !communityId) {
      showError("Only moderators can ban users");
      return;
    }

    if (targetPubkey === community.pubkey) {
      showError("Community owner cannot be banned");
      return;
    }

    try {
      const banEvent = new NDKEvent(ndk);
      banEvent.kind = COMMUNITY_BLOCK_KIND as any;
      banEvent.content = "Blocked by moderator";
      banEvent.tags = [
        ["a", `34550:${community.pubkey}:${communityId}`],
        ["p", targetPubkey],
        ["e", "block"],
      ];

      await banEvent.publish();
      setPosts(prev => prev.filter(post => post.pubkey !== targetPubkey));
      setFilteredPosts(prev => prev.filter(post => post.pubkey !== targetPubkey));
      success("User banned from community");
    } catch (error) {
      logger.error("Failed to ban user", error);
      showError("Failed to ban user");
    }
  };

  const getCommunityInfo = () => {
    if (!community) return { name: "", description: "", image: "", rules: "", moderators: [] as string[], flairs: [] as string[] };
    
    const moderators = community.tags
      .filter(t => t[0] === "p" && t[3] === "moderator")
      .map(t => t[1]);
    
    const flairs = community.tags
      .filter(t => t[0] === "flair")
      .map(t => t[1]);
    
    return {
      name: community.tags.find(t => t[0] === "name")?.[1] || "Unnamed",
      description: community.tags.find(t => t[0] === "description")?.[1] || "",
      image: community.tags.find(t => t[0] === "image")?.[1] || "",
      rules: community.tags.find(t => t[0] === "rules")?.[1] || "",
      moderators,
      flairs
    };
  };

  const handleVote = (post: NDKEvent, type: "UPVOTE" | "DOWNVOTE") => {
    handleReaction(post, type);
  };

  const communityInfo = getCommunityInfo();
  const visiblePosts = filteredPosts.filter(post => {
    const status = getPostModerationStatus(post.id);
    return status !== "rejected" || Boolean(isModerator);
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-400">Loading community...</div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
        <p className="text-gray-400 mb-4">Community not found</p>
        <button
          onClick={() => navigate("/communities")}
          className="px-6 py-2 bg-[var(--primary)] text-white rounded-full font-bold hover:bg-[var(--primary-dark)]"
        >
          Back to Communities
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showEditModal && isOwner && (
        <EditCommunityModal 
          community={community} 
          exit={() => setShowEditModal(false)} 
        />
      )}
      
      {showModeratorsModal && (
        <ManageModeratorsModal
          community={community}
          exit={() => setShowModeratorsModal(false)}
          onUpdate={() => window.location.reload()}
        />
      )}
      
      {showBlockedModal && (
        <ManageBlockedUsersModal
          community={community}
          exit={() => setShowBlockedModal(false)}
        />
      )}
      
      {showWikiModal && (
        <CommunityWikiModal
          community={community}
          communityId={communityId || ""}
          isOwner={!!isOwner}
          isModerator={!!isModerator}
          exit={() => setShowWikiModal(false)}
        />
      )}

      {/* Back Button */}
      <button
        onClick={() => navigate("/communities")}
        className="flex items-center space-x-2 text-[var(--primary)] hover:text-[var(--primary)] transition-colors"
      >
        <ArrowLeft size={20} />
        <span>Back to Communities</span>
      </button>

      {/* Community Header */}
      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        {communityInfo.image && (
          <img
            src={communityInfo.image}
            alt={communityInfo.name}
            className="w-full h-48 object-cover"
          />
        )}
        
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-black mb-2">{communityInfo.name}</h1>
              {communityInfo.description ? (
                <div className="[&_.prose]:max-w-none [&_.prose]:text-sm [&_.prose]:text-gray-400 [&_.prose_p]:my-0">
                  <MarkdownContent content={communityInfo.description} />
                </div>
              ) : (
                <p className="text-sm text-gray-400">No description yet.</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-2">
                {isOwner && (
                  <>
                    <button
                      onClick={() => setShowEditModal(true)}
                      className="flex items-center space-x-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-dark)] transition-all"
                    >
                      <Edit2 size={16} />
                      <span>Edit</span>
                    </button>
                  </>
                )}
                {isModerator && (
                  <>
                    <button
                      onClick={() => setShowModeratorsModal(true)}
                      className="flex items-center space-x-2 px-4 py-2 bg-accent hover:bg-accent/70 text-white rounded-lg transition-all"
                      title="Manage Moderators"
                    >
                      <Users size={16} />
                    </button>
                    <button
                      onClick={() => setShowBlockedModal(true)}
                      className="flex items-center space-x-2 px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-all"
                      title="Manage Blocked Users"
                    >
                      <Gavel size={16} />
                    </button>
                  </>
                )}
                
                {/* Join/Leave Button */}
                {user && !isOwner && (
                  <button
                    onClick={handleJoinLeave}
                    disabled={isJoining}
                    className={`flex items-center space-x-2 px-6 py-2 rounded-lg font-bold transition-all ${
                      hasJoined
                        ? "bg-accent text-foreground hover:bg-accent/70"
                        : "bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]"
                    } ${isJoining ? "opacity-50" : ""}`}
                  >
                    {isJoining ? (
                      <span>...</span>
                    ) : hasJoined ? (
                      <>
                        <UserCheck size={16} />
                        <span>Joined</span>
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} />
                        <span>Join</span>
                      </>
                    )}
                  </button>
                )}
                
                {/* Wiki Button */}
                <button
                  onClick={() => setShowWikiModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-accent hover:bg-accent/70 text-white rounded-lg transition-all"
                  title="Community Wiki"
                >
                  <Book size={16} />
                  <span className="hidden sm:inline">Wiki</span>
                </button>
              </div>

            </div>
          </div>

          {(communityInfo.moderators.length > 0 || (user && !isCurrentUserBlocked() && community)) && (
            <div
              className={`mb-4 flex items-start gap-4 ${
                communityInfo.moderators.length > 0 ? "justify-between" : "justify-end"
              }`}
            >
              {communityInfo.moderators.length > 0 && (
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                    <Shield size={14} className="text-[var(--primary)]" />
                    <span>Moderators:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {communityInfo.moderators.map((mod) => (
                      <span
                        key={mod}
                        className="text-xs px-2 py-1 bg-accent/50 rounded-md font-mono"
                      >
                        {mod.slice(0, 16)}...{mod.slice(-4)}
                        {mod === community.pubkey && <span className="text-[var(--primary)] ml-1">(owner)</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {user && !isCurrentUserBlocked() && community && (
                <button
                  onClick={() => setShowCreatePostForm((prev) => !prev)}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-dark)] transition-all text-sm font-bold"
                >
                  <span>✍️</span>
                  <span>Create post</span>
                </button>
              )}
            </div>
          )}

          {communityInfo.rules && (
            <div className="mt-4 p-4 bg-accent/30 rounded-lg">
              <h3 className="font-bold text-sm mb-2">Community Rules</h3>
              <div className="[&_.prose]:max-w-none [&_.prose]:text-sm [&_.prose]:text-gray-400 [&_.prose_p]:my-2">
                <MarkdownContent content={communityInfo.rules} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Blocked Warning */}
      {isCurrentUserBlocked() && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-center gap-2 text-red-400 font-bold">
            <Gavel size={20} />
            <span>You have been blocked from this community</span>
          </div>
          <p className="text-sm text-red-400/80 mt-1">
            You can still view content but cannot create posts or comments.
          </p>
        </div>
      )}

      {/* Create Post */}
      {user && !isCurrentUserBlocked() && community && showCreatePostForm && (
        <CreatePost
          community={{
            id: communityId || "",
            pubkey: community.pubkey,
            name: communityInfo.name,
            atag: `34550:${pubkey}:${communityId}`,
            flairs: communityInfo.flairs,
          }}
          onPostCreated={() => {
            setShowCreatePostForm(false);
            // Refresh posts after creating
            seenPostIds.current.clear();
            // Reload posts
            const communityATag = `34550:${pubkey}:${communityId}`;
            ndk.fetchEvents(
              { kinds: [NDKKind.Text], "#a": [communityATag], limit: 50 },
              { closeOnEose: true }
            ).then((fetchedEvents) => {
              const newPosts = Array.from(fetchedEvents).sort(
                (a, b) => (b.created_at || 0) - (a.created_at || 0)
              );
              setPosts(newPosts);
            });
          }}
        />
      )}

      {/* Posts */}
      <div className="space-y-4">
        {votingError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertCircle size={16} />
            <span>{votingError}</span>
          </div>
        )}
        
        {/* Search Posts */}
        <div className="bg-card border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search posts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-accent/50 border rounded-lg focus:ring-1 focus:ring-[var(--primary)] text-sm"
              />
            </div>
            <div className="relative group shrink-0">
              <button
                type="button"
                aria-label="Search syntax help"
                className="w-8 h-8 rounded-full bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
              >
                <HelpCircle size={16} />
              </button>
              <div className="pointer-events-none absolute right-0 top-10 z-10 w-80 rounded-lg border bg-card/95 p-3 text-xs text-muted-foreground shadow-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                Use <code>user:xxx</code> (name/pubkey/npub), <code>tag:yyy</code>, or quoted values
                like <code>tag:&quot;open source&quot;</code>. Plain text also works, for example:
                <code> user:npub1... tag:&quot;nostr update&quot; search </code>.
              </div>
            </div>
          </div>
        </div>

        {visiblePosts.length === 0 && (
          <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
            <p className="text-gray-400">
              {searchQuery ? "No posts match your search" : "No posts yet. Be the first!"}
            </p>
          </div>
        )}

        {visiblePosts.map((post) => {
          const postStatus = getPostModerationStatus(post.id);

          return (
            <div key={post.id} className="bg-card border rounded-xl shadow-sm hover:border-[var(--primary)]/20 transition-all group">
              <div className="flex">
              {/* Voting */}
              <div className="w-12 bg-accent/30 flex flex-col items-center py-4 space-y-1 rounded-l-xl">
                <button 
                  onClick={() => handleVote(post, "UPVOTE")}
                  disabled={votingIds.has(post.id)}
                  className={`transition-colors ${userVotes[post.id] === "UPVOTE" ? "text-[var(--primary)]" : "text-muted-foreground hover:text-[var(--primary)]"} ${votingIds.has(post.id) ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <ArrowBigUp size={24} fill={userVotes[post.id] === "UPVOTE" ? "currentColor" : "none"} />
                </button>
                <span className={`text-[13px] font-black ${
                  userVotes[post.id] === "UPVOTE" ? "text-[var(--primary)]" : 
                  userVotes[post.id] === "DOWNVOTE" ? "text-blue-600" : ""
                }`}>
                  {reactions[post.id] || 0}
                </span>
                <button 
                  onClick={() => handleVote(post, "DOWNVOTE")}
                  disabled={votingIds.has(post.id)}
                  className={`transition-colors ${userVotes[post.id] === "DOWNVOTE" ? "text-blue-600" : "text-muted-foreground hover:text-blue-600"} ${votingIds.has(post.id) ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <ArrowBigDown size={24} fill={userVotes[post.id] === "DOWNVOTE" ? "currentColor" : "none"} />
                </button>
              </div>

              <div className="p-4 flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <div className="w-6 h-6 bg-[var(--primary)]/20 rounded-full overflow-hidden flex items-center justify-center">
                      {profiles[post.pubkey]?.image ? (
                        <img src={profiles[post.pubkey].image} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-[var(--primary)]">{post.pubkey.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="font-mono">{post.pubkey.slice(0, 12)}...</span>
                    <span>•</span>
                    <span>{new Date((post.created_at || 0) * 1000).toLocaleString()}</span>
                    {(editedPosts.has(post.id) || post.tags.find(t => t[0] === "edited")) && (
                      <span className="text-[var(--primary)] text-[10px]">(edited)</span>
                    )}
                    {isModerator && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          postStatus === "approved"
                            ? "bg-green-500/10 text-green-400"
                            : postStatus === "rejected"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-yellow-500/10 text-yellow-400"
                        }`}
                      >
                        {postStatus}
                      </span>
                    )}
                  </div>
                  
                  <PostActionsMenu
                    post={post}
                    onEdit={handleEditPost}
                    onDelete={handleDeletePost}
                    onApprove={(id) => handleModeratePost(id, "approved")}
                    onReject={(id) => handleModeratePost(id, "rejected")}
                    onBanUser={handleBanUserFromPost}
                    moderationState={postStatus}
                    canModerate={Boolean(isModerator)}
                  />
                  
                  <div className="flex items-center gap-2">
                    <SavePostButton post={post} size="sm" />
                    <ZapButton 
                      targetPubkey={post.pubkey} 
                      eventId={post.id}
                      size="sm"
                    />
                  </div>
                </div>
                
                <p className="text-sm whitespace-pre-wrap">{post.content}</p>
              </div>
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}
