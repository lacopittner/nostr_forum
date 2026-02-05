import { useNostr } from "../providers/NostrProvider";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { Edit2, Send, ArrowLeft, Shield, Users, ArrowBigUp, ArrowBigDown, Gavel, UserPlus, UserCheck, Search, Book, AlertCircle } from "lucide-react";
import { EditCommunityModal } from "../components/EditCommunityModal";
import { ManageModeratorsModal } from "../components/ManageModeratorsModal";
import { ManageBlockedUsersModal } from "../components/ManageBlockedUsersModal";
import { useCommunityBlocks } from "../hooks/useCommunityBlocks";
import { useCommunityMembership } from "../hooks/useCommunityMembership";
import { useVoting } from "../hooks/useVoting";
import { FlairSelector } from "../components/FlairSelector";
import { PostActionsMenu } from "../components/PostActionsMenu";
import { CommunityWikiModal } from "../components/CommunityWikiModal";
import { SavePostButton } from "../components/SavePostButton";
import { ZapButton } from "../components/ZapButton";

export function CommunityDetailPage() {
  const { ndk, user } = useNostr();
  const { pubkey, communityId } = useParams<{ pubkey: string; communityId: string }>();
  const navigate = useNavigate();
  const [community, setCommunity] = useState<NDKEvent | null>(null);
  const [posts, setPosts] = useState<NDKEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newPostContent, setNewPostContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showModeratorsModal, setShowModeratorsModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showWikiModal, setShowWikiModal] = useState(false);
  const [selectedFlair, setSelectedFlair] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredPosts, setFilteredPosts] = useState<NDKEvent[]>([]);
  const [postError, setPostError] = useState<string | null>(null);
  
  // Track edited posts
  const [editedPosts, setEditedPosts] = useState<Set<string>>(new Set());
  
  // Membership
  const { isMember, joinCommunity, leaveCommunity } = useCommunityMembership();
  const [isJoining, setIsJoining] = useState(false);
  
  // Voting - use the custom hook instead of duplicating logic
  const { reactions, userVotes, votingIds, error: votingError, handleReaction, processIncomingReaction, processIncomingDeletion } = useVoting();
  
  // Profile fetching
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const profileFetchQueue = useRef(new Set<string>());
  
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
      console.error("Failed to fetch profile:", pubkey, e);
      // Silently fail - user pubkey will be displayed instead
    }
  }, [ndk, profiles]);



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
        console.error("Failed to fetch community", error);
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

    return () => {
      postSub.stop();
    };
  }, [community, ndk, pubkey, communityId, fetchProfile, processIncomingReaction, processIncomingDeletion]);

  // Filter posts by search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPosts(posts);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = posts.filter(post => 
      post.content.toLowerCase().includes(query) ||
      post.pubkey.toLowerCase().includes(query)
    );
    setFilteredPosts(filtered);
  }, [searchQuery, posts]);

  // Handle edit post
  const handleEditPost = async (postId: string, newContent: string) => {
    if (!user) return;
    
    try {
      // Create a new event with the same ID (replacement)
      const post = posts.find(p => p.id === postId);
      if (!post) return;

      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;
      event.content = newContent;
      event.tags = post.tags;
      
      // Add edited tag
      if (!event.tags.find(t => t[0] === "edited")) {
        event.tags.push(["edited", new Date().toISOString()]);
      }

      await event.publish();
      
      // Update local state - only update content, keep the rest of the event
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          // Create a new event with updated content
          const updatedEvent = new NDKEvent(ndk);
          updatedEvent.kind = p.kind;
          updatedEvent.content = newContent;
          updatedEvent.tags = [...p.tags];
          updatedEvent.created_at = p.created_at;
          return updatedEvent;
        }
        return p;
      }));
      setEditedPosts(prev => new Set(prev).add(postId));
    } catch (error) {
      console.error("Failed to edit post", error);
      alert("Failed to edit post");
    }
  };

  // Handle delete post
  const handleDeletePost = async (postId: string) => {
    if (!user) return;
    
    try {
      const deletion = new NDKEvent(ndk);
      deletion.kind = 5;
      deletion.content = "Deleted by author";
      deletion.tags = [["e", postId]];
      
      await deletion.publish();
      
      // Remove from local state
      setPosts(prev => prev.filter(p => p.id !== postId));
      setFilteredPosts(prev => prev.filter(p => p.id !== postId));
    } catch (error) {
      console.error("Failed to delete post", error);
      alert("Failed to delete post");
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

  const handleCreatePost = async () => {
    if (!newPostContent.trim() || !user || !community || isPublishing) return;
    
    // Check if user is blocked
    if (isCurrentUserBlocked()) {
      setPostError("You have been blocked from posting in this community.");
      return;
    }

    setIsPublishing(true);
    setPostError(null);
    
    try {
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;
      event.content = newPostContent;
      
      const communityATag = `34550:${pubkey}:${communityId}`;
      event.tags = [
        ["a", communityATag, community.pubkey, "root"],
        ["t", "community"]
      ];
      
      // Add flair if selected
      if (selectedFlair) {
        event.tags.push(["flair", selectedFlair]);
      }
      
      await event.publish();
      setNewPostContent("");
      setSelectedFlair(null);
    } catch (error) {
      console.error("Failed to publish post:", error);
      setPostError("Failed to publish post. Check your relay connection.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleVote = (post: NDKEvent, type: "UPVOTE" | "DOWNVOTE") => {
    handleReaction(post, type);
  };

  const communityInfo = getCommunityInfo();

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
          className="px-6 py-2 bg-orange-600 text-white rounded-full font-bold hover:bg-orange-700"
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
        className="flex items-center space-x-2 text-orange-500 hover:text-orange-600 transition-colors"
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
              <p className="text-gray-400">{communityInfo.description}</p>
            </div>
            <div className="flex gap-2">
              {isOwner && (
                <>
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all"
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
                      : "bg-orange-600 text-white hover:bg-orange-700"
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

          {/* Moderators */}
          {communityInfo.moderators.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                <Shield size={14} className="text-orange-500" />
                <span>Moderators:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {communityInfo.moderators.map((mod) => (
                  <span
                    key={mod}
                    className="text-xs px-2 py-1 bg-accent/50 rounded-md font-mono"
                  >
                    {mod.slice(0, 16)}...{mod.slice(-4)}
                    {mod === community.pubkey && <span className="text-orange-500 ml-1">(owner)</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {communityInfo.rules && (
            <div className="mt-4 p-4 bg-accent/30 rounded-lg">
              <h3 className="font-bold text-sm mb-2">Community Rules</h3>
              <p className="text-sm text-gray-400 whitespace-pre-wrap">{communityInfo.rules}</p>
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
      {user && !isCurrentUserBlocked() && (
        <div className="bg-card border rounded-xl p-4 shadow-sm">
          {postError && (
            <div className="mb-3 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle size={16} />
              <span>{postError}</span>
            </div>
          )}
          <textarea
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            placeholder="Share something with this community..."
            className="w-full bg-accent/50 border-none rounded-lg p-3 text-sm focus:ring-1 focus:ring-orange-500 min-h-[100px] resize-none overflow-hidden"
          />
          <div className="mt-3 flex items-center justify-between">
            {/* Flair Selector */}
            <FlairSelector
              flairs={communityInfo.flairs}
              selectedFlair={selectedFlair}
              onSelect={setSelectedFlair}
            />
            
            <button
              onClick={handleCreatePost}
              disabled={isPublishing || !newPostContent.trim()}
              className="flex items-center space-x-2 px-6 py-2 bg-orange-600 text-white rounded-full font-bold text-sm hover:bg-orange-700 disabled:opacity-50 transition-all"
            >
              <Send size={16} />
              <span>{isPublishing ? "Posting..." : "Post"}</span>
            </button>
          </div>
        </div>
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search posts in this community..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-accent/50 border rounded-lg focus:ring-1 focus:ring-orange-500 text-sm"
            />
          </div>
        </div>

        {filteredPosts.length === 0 && (
          <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
            <p className="text-gray-400">
              {searchQuery ? "No posts match your search" : "No posts yet. Be the first!"}
            </p>
          </div>
        )}

        {filteredPosts.map((post) => (
          <div key={post.id} className="bg-card border rounded-xl shadow-sm hover:border-orange-500/20 transition-all group">
            <div className="flex">
              {/* Voting */}
              <div className="w-12 bg-accent/30 flex flex-col items-center py-4 space-y-1 rounded-l-xl">
                <button 
                  onClick={() => handleVote(post, "UPVOTE")}
                  disabled={votingIds.has(post.id)}
                  className={`transition-colors ${userVotes[post.id] === "UPVOTE" ? "text-orange-600" : "text-muted-foreground hover:text-orange-600"} ${votingIds.has(post.id) ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <ArrowBigUp size={24} fill={userVotes[post.id] === "UPVOTE" ? "currentColor" : "none"} />
                </button>
                <span className={`text-[13px] font-black ${
                  userVotes[post.id] === "UPVOTE" ? "text-orange-600" : 
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
                    <div className="w-6 h-6 bg-orange-600/20 rounded-full overflow-hidden flex items-center justify-center">
                      {profiles[post.pubkey]?.image ? (
                        <img src={profiles[post.pubkey].image} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-orange-600">{post.pubkey.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="font-mono">{post.pubkey.slice(0, 12)}...</span>
                    <span>•</span>
                    <span>{new Date((post.created_at || 0) * 1000).toLocaleString()}</span>
                    {(editedPosts.has(post.id) || post.tags.find(t => t[0] === "edited")) && (
                      <span className="text-orange-500 text-[10px]">(edited)</span>
                    )}
                  </div>
                  
                  <PostActionsMenu
                    post={post}
                    onEdit={handleEditPost}
                    onDelete={handleDeletePost}
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
        ))}
      </div>
    </div>
  );
}
