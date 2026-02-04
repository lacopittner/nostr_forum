import { useNostr } from "../providers/NostrProvider";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { Edit2, Send, ArrowLeft, Shield, Users, ArrowBigUp, ArrowBigDown, Gavel, UserPlus, UserCheck } from "lucide-react";
import { EditCommunityModal } from "../components/EditCommunityModal";
import { ManageModeratorsModal } from "../components/ManageModeratorsModal";
import { ManageBlockedUsersModal } from "../components/ManageBlockedUsersModal";
import { useCommunityBlocks } from "../hooks/useCommunityBlocks";
import { useCommunityMembership } from "../hooks/useCommunityMembership";
import { FlairSelector } from "../components/FlairSelector";

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
  const [selectedFlair, setSelectedFlair] = useState<string | null>(null);
  
  // Membership
  const { isMember, joinCommunity, leaveCommunity } = useCommunityMembership();
  const [isJoining, setIsJoining] = useState(false);
  
  // Voting state
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [userVotes, setUserVotes] = useState<Record<string, "UPVOTE" | "DOWNVOTE" | null>>({});
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  
  const seenPostIds = useRef(new Set<string>());
  const reactionMap = useRef<Record<string, Record<string, { id: string; content: string; created_at: number }>>>({});
  const votingLock = useRef(new Set<string>());
  
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
    if (profiles[pubkey]) return;
    try {
      const profile = await ndk.getUser({ pubkey }).fetchProfile();
      if (profile) {
        setProfiles(prev => ({ ...prev, [pubkey]: profile }));
      }
    } catch (e) {
      // Ignore errors
    }
  }, [ndk, profiles]);

  const updateScores = useCallback(() => {
    const newScores: Record<string, number> = {};
    const newUserVotes: Record<string, "UPVOTE" | "DOWNVOTE" | null> = {};

    for (const [postId, users] of Object.entries(reactionMap.current)) {
      let score = 0;
      for (const [pubkey, reaction] of Object.entries(users)) {
        if (reaction.content === "NEUTRAL") continue;
        const isDown = reaction.content === "DOWNVOTE" || reaction.content === "-";
        score += isDown ? -1 : 1;
        if (user && pubkey === user.pubkey) {
          newUserVotes[postId] = isDown ? "DOWNVOTE" : "UPVOTE";
        }
      }
      newScores[postId] = score;
    }
    setReactions(newScores);
    setUserVotes(newUserVotes);
  }, [user?.pubkey]);

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
          if (!reactionMap.current[event.id]) reactionMap.current[event.id] = {};
          const existing = reactionMap.current[event.id][reactionEvent.pubkey];
          if (!existing || reactionEvent.created_at! > existing.created_at) {
            reactionMap.current[event.id][reactionEvent.pubkey] = {
              id: reactionEvent.id,
              content: reactionEvent.content,
              created_at: reactionEvent.created_at!
            };
            updateScores();
          }
        });
      }
    });

    return () => {
      postSub.stop();
    };
  }, [community, ndk, pubkey, communityId, fetchProfile, updateScores]);

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
      alert("You have been blocked from posting in this community.");
      return;
    }

    setIsPublishing(true);
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
    } catch (error) {
      console.error("Failed to publish post", error);
      alert("Failed to publish post. Check if your relay is running.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleReaction = async (post: NDKEvent, type: "UPVOTE" | "DOWNVOTE") => {
    if (!user || votingLock.current.has(post.id)) return;

    const lastReaction = reactionMap.current[post.id]?.[user.pubkey];
    const lastContent = lastReaction?.content;
    const lastId = lastReaction?.id;

    const isCurrentlyUp = lastContent === "UPVOTE" || lastContent === "+";
    const isCurrentlyDown = lastContent === "DOWNVOTE" || lastContent === "-";
    const isUndoing = (type === "UPVOTE" && isCurrentlyUp) || 
                     (type === "DOWNVOTE" && isCurrentlyDown);
    
    votingLock.current.add(post.id);
    setVotingIds(prev => new Set(prev).add(post.id));

    try {
      if (isUndoing) {
        if (lastId) {
          const deletion = new NDKEvent(ndk);
          deletion.kind = 5;
          deletion.content = "Unvoting";
          deletion.tags = [["e", lastId]];
          await deletion.publish();
        }
        if (reactionMap.current[post.id]) {
          delete reactionMap.current[post.id][user.pubkey];
        }
      } else {
        const reaction = new NDKEvent(ndk);
        reaction.kind = NDKKind.Reaction;
        reaction.content = type === "UPVOTE" ? "+" : "-";
        reaction.tags = [
          ["e", post.id],
          ["p", post.pubkey]
        ];
        
        if (!reactionMap.current[post.id]) reactionMap.current[post.id] = {};
        reactionMap.current[post.id][user.pubkey] = {
          id: reaction.id,
          content: reaction.content,
          created_at: Math.floor(Date.now() / 1000)
        };

        await reaction.publish();
      }
      
      updateScores();
    } catch (error) {
      console.error("Reaction failed", error);
    } finally {
      votingLock.current.delete(post.id);
      setVotingIds(prev => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }
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
        {posts.length === 0 && (
          <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
            <p className="text-gray-400">No posts yet. Be the first!</p>
          </div>
        )}

        {posts.map((post) => (
          <div key={post.id} className="bg-card border rounded-xl shadow-sm hover:border-orange-500/20 transition-all group">
            <div className="flex">
              {/* Voting */}
              <div className="w-12 bg-accent/30 flex flex-col items-center py-4 space-y-1 rounded-l-xl">
                <button 
                  onClick={() => handleReaction(post, "UPVOTE")}
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
                  onClick={() => handleReaction(post, "DOWNVOTE")}
                  disabled={votingIds.has(post.id)}
                  className={`transition-colors ${userVotes[post.id] === "DOWNVOTE" ? "text-blue-600" : "text-muted-foreground hover:text-blue-600"} ${votingIds.has(post.id) ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <ArrowBigDown size={24} fill={userVotes[post.id] === "DOWNVOTE" ? "currentColor" : "none"} />
                </button>
              </div>

              <div className="p-4 flex-1">
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
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
