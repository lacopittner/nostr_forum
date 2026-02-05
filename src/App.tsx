import { NostrProvider, useNostr } from "./providers/NostrProvider";
import { AppShell } from "./components/layout/AppShell";
import { ArrowBigUp, ArrowBigDown, MessageSquare, Share2, MoreHorizontal, Send } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { ProfilePage } from "./pages/ProfilePage";
import { SearchPage } from "./pages/SearchPage";
import { RelayManagementPage } from "./pages/RelayManagementPage";
import { CommunitiesPage } from "./pages/CommunitiesPage";
import { CommunityDetailPage } from "./pages/CommunityDetailPage";
import { PostDetailPage } from "./pages/PostDetailPage";
import { SavePostButton } from "./components/SavePostButton";
import { ZapButton } from "./components/ZapButton";

function Feed() {
  const { ndk, user } = useNostr();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<NDKEvent[]>([]);
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [userVotes, setUserVotes] = useState<Record<string, "UPVOTE" | "DOWNVOTE" | null>>({});
  const [newPostContent, setNewPostContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [postVoters, setPostVoters] = useState<Record<string, { up: string[], down: string[] }>>({});
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [sortBy, setSortBy] = useState<"hot" | "new" | "top">("hot");

  const seenEventIds = useRef(new Set<string>());
  const reactionMap = useRef<Record<string, Record<string, { id: string, content: string, created_at: number }>>>({});
  const profileFetchQueue = useRef(new Set<string>());
  const votingLock = useRef(new Set<string>());

  const fetchProfile = useCallback(async (pubkey: string) => {
    if (profiles[pubkey] || profileFetchQueue.current.has(pubkey)) return;
    profileFetchQueue.current.add(pubkey);

    const profile = await ndk.getUser({ pubkey }).fetchProfile();
    if (profile) {
      setProfiles(prev => ({ ...prev, [pubkey]: profile }));
    }
  }, [ndk, profiles]);

  const updateScores = useCallback(() => {
    const newScores: Record<string, number> = {};
    const newUserVotes: Record<string, "UPVOTE" | "DOWNVOTE" | null> = {};
    const newVoters: Record<string, { up: string[], down: string[] }> = {};

    for (const [postId, users] of Object.entries(reactionMap.current)) {
      let score = 0;
      newVoters[postId] = { up: [], down: [] };

      for (const [pubkey, reaction] of Object.entries(users)) {
        if (reaction.content === "NEUTRAL") continue;
        
        const isDown = reaction.content === "DOWNVOTE" || reaction.content === "-";
        const value = isDown ? -1 : 1;
        score += value;
        
        // Ensure we fetch the profile of the voter
        fetchProfile(pubkey);

        if (isDown) {
          newVoters[postId].down.push(pubkey);
        } else {
          newVoters[postId].up.push(pubkey);
        }
        
        if (user && pubkey === user.pubkey) {
          newUserVotes[postId] = isDown ? "DOWNVOTE" : "UPVOTE";
        }
      }
      newScores[postId] = score;
    }
    setReactions(newScores);
    setUserVotes(newUserVotes);
    setPostVoters(newVoters);
  }, [user?.pubkey, fetchProfile]);

  // Fetch posts and reactions
  useEffect(() => {
    // Subscribe to Kind 1 (Posts)
    const postSub = ndk.subscribe(
      { kinds: [NDKKind.Text], limit: 50 },
      { closeOnEose: false }
    );

    postSub.on("event", (event: NDKEvent) => {
      if (seenEventIds.current.has(event.id)) return;
      seenEventIds.current.add(event.id);

      fetchProfile(event.pubkey);

      setPosts((prev) => {
        const newPosts = [...prev, event];
        return sortPosts(newPosts, sortBy).slice(0, 50);
      });

      // Fetch comment count for this post
      const commentSub = ndk.subscribe(
        { kinds: [NDKKind.Text], "#e": [event.id], limit: 100 },
        { closeOnEose: true }
      );
      
      let count = 0;
      commentSub.on("event", () => {
        count++;
      });
      
      commentSub.on("eose", () => {
        setCommentCounts(prev => ({ ...prev, [event.id]: count }));
      });

      // Target specific reactions for this new post
      ndk.subscribe(
        { kinds: [NDKKind.Reaction], "#e": [event.id] },
        { closeOnEose: true }
      ).on("event", (reactionEvent: NDKEvent) => {
        if (seenEventIds.current.has(reactionEvent.id)) return;
        seenEventIds.current.add(reactionEvent.id);

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
    });

    // Subscribe to Kind 7 (General stream)
    const reactionSub = ndk.subscribe(
      { kinds: [NDKKind.Reaction], limit: 500 },
      { closeOnEose: false }
    );

    reactionSub.on("event", (event: NDKEvent) => {
      if (seenEventIds.current.has(event.id)) return;
      seenEventIds.current.add(event.id);

      const targetId = event.tags.find(t => t[0] === "e")?.[1];
      if (targetId) {
        if (!reactionMap.current[targetId]) reactionMap.current[targetId] = {};
        
        const existing = reactionMap.current[targetId][event.pubkey];
        if (!existing || event.created_at! > existing.created_at) {
          reactionMap.current[targetId][event.pubkey] = {
            id: event.id,
            content: event.content,
            created_at: event.created_at!
          };
          updateScores();
        }
      }
    });

    // Subscribe to Kind 5 (Deletions)
    const deletionSub = ndk.subscribe(
      { kinds: [5], limit: 100 },
      { closeOnEose: false }
    );

    deletionSub.on("event", (event: NDKEvent) => {
      const targetIds = event.tags.filter(t => t[0] === "e").map(t => t[1]);
      let changed = false;

      for (const targetId of targetIds) {
        for (const [postId, users] of Object.entries(reactionMap.current)) {
          for (const [pubkey, reaction] of Object.entries(users)) {
            if (reaction.id === targetId) {
              delete reactionMap.current[postId][pubkey];
              changed = true;
            }
          }
        }
      }

      if (changed) updateScores();
    });

    return () => {
      postSub.stop();
      reactionSub.stop();
      deletionSub.stop();
    };
  }, [ndk, updateScores, sortBy]);

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
        // Hot - combination of score and recency
        const scoreA = reactions[a.id] || 0;
        const scoreB = reactions[b.id] || 0;
        const ageA = Date.now() / 1000 - (a.created_at || 0);
        const ageB = Date.now() / 1000 - (b.created_at || 0);
        // Simple hot algorithm: score / log(age + 2)
        const hotA = scoreA / Math.log(ageA + 2);
        const hotB = scoreB / Math.log(ageB + 2);
        return hotB - hotA;
      }
    });
  };

  // Re-sort when sort option changes
  useEffect(() => {
    setPosts(prev => sortPosts(prev, sortBy));
  }, [sortBy, reactions]);

  const handleCreatePost = async () => {
    if (!newPostContent.trim() || !user || isPublishing) return;

    setIsPublishing(true);
    try {
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;
      event.content = newPostContent;
      event.tags = [["t", "nostr"], ["a", "34550:global:community"]];
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

    // Use reactionMap.current directly for logic to avoid state race conditions
    const lastReaction = reactionMap.current[post.id]?.[user.pubkey];
    const lastContent = lastReaction?.content;
    const lastId = lastReaction?.id;

    const isCurrentlyUp = lastContent === "UPVOTE" || lastContent === "+";
    const isCurrentlyDown = lastContent === "DOWNVOTE" || lastContent === "-";

    const isUndoing = (type === "UPVOTE" && isCurrentlyUp) || 
                     (type === "DOWNVOTE" && isCurrentlyDown);
    
    // 1. Lock voting (Synchronous)
    votingLock.current.add(post.id);
    setVotingIds(prev => new Set(prev).add(post.id));

    try {
      if (isUndoing) {
        // YAKIHONNE STYLE: "Unlike" by deleting the reaction event (Kind 5)
        if (lastId) {
          const deletion = new NDKEvent(ndk);
          deletion.kind = 5;
          deletion.content = "Unvoting from Nostr-Forum";
          deletion.tags = [["e", lastId]];
          await deletion.publish();
        }
        
        // Optimistic clear
        if (reactionMap.current[post.id]) {
          delete reactionMap.current[post.id][user.pubkey];
        }
      } else {
        // Publish new reaction (Kind 7)
        const reaction = new NDKEvent(ndk);
        reaction.kind = NDKKind.Reaction;
        reaction.content = type === "UPVOTE" ? "+" : "-";
        reaction.tags = [
          ["e", post.id],
          ["p", post.pubkey]
        ];
        
        // Mark as seen so listener doesn't process older echo
        seenEventIds.current.add(reaction.id);
        
        // Optimistic Update
        if (!reactionMap.current[post.id]) reactionMap.current[post.id] = {};
        reactionMap.current[post.id][user.pubkey] = {
          id: reaction.id,
          content: reaction.content,
          created_at: Math.floor(Date.now() / 1000)
        };

        await reaction.publish();
      }
      
      // 3. Re-calculate scores and UI
      updateScores();

      // Log for the user
      const postReactions = reactionMap.current[post.id] || {};
      let score = 0;
      for (const r of Object.values(postReactions)) {
        score += (r.content === "-" || r.content === "DOWNVOTE") ? -1 : 1;
      }
      console.log(`[VOTE LOG] ${user.npub.slice(0, 12)}... ${isUndoing ? 'deleted' : 'sent'} ${type.toLowerCase()} on post ${post.id.slice(0, 8)}. New score: ${score}`);

    } catch (error) {
      console.error("Reaction failed", error);
    } finally {
      // 5. Release lock
      votingLock.current.delete(post.id);
      setVotingIds(prev => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }
  };

  const handleReply = async (post: NDKEvent) => {
    if (!replyContent.trim() || !user || isPublishing) return;

    setIsPublishing(true);
    try {
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;
      event.content = replyContent;
      
      // Find the root event if it exists in tags
      const rootTag = post.tags.find(t => t[0] === "e" && t[3] === "root") || post.tags.find(t => t[0] === "e");
      const rootId = rootTag ? rootTag[1] : post.id;

      // NIP-10 tagging
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
      console.error("Failed to publish reply", error);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Post Area */}
      {user && (
        <div className="bg-card border rounded-xl p-4 shadow-sm">
          <textarea
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            placeholder="What's on your mind? (Posts will be Kind 1 notes)"
            className="w-full bg-accent/50 border-none rounded-lg p-3 text-sm focus:ring-1 focus:ring-orange-500 min-h-[100px] resize-none overflow-hidden"
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleCreatePost}
              disabled={isPublishing || !newPostContent.trim()}
              className="flex items-center space-x-2 px-6 py-2 bg-orange-600 text-white rounded-full font-bold text-sm hover:bg-orange-700 disabled:opacity-50 transition-all"
            >
              <Send size={16} />
              <span>{isPublishing ? "Posting..." : "Post to Nostr"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Hero Header from previous version, only if no posts */}
      {posts.length === 0 && (
        <div className="relative overflow-hidden bg-gradient-to-br from-orange-600 to-orange-400 rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-orange-600/20">
          <div className="relative z-10">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tighter mb-2">The Relay is Quiet...</h1>
            <p className="text-orange-50 text-sm sm:text-base max-w-xl opacity-90 leading-relaxed">
              Successfully connected to ws://localhost:4433. Be the first to start the conversation on your local relay!
            </p>
          </div>
        </div>
      )}
      
      {/* Sorting Controls */}
      {posts.length > 0 && (
        <div className="flex items-center justify-between bg-card border rounded-xl p-3 shadow-sm">
          <span className="text-sm font-bold text-gray-400">Sort by:</span>
          <div className="flex items-center gap-2">
            {(["hot", "new", "top"] as const).map((sort) => (
              <button
                key={sort}
                onClick={() => setSortBy(sort)}
                className={`px-4 py-1.5 rounded-full text-sm font-bold capitalize transition-all ${
                  sortBy === sort
                    ? "bg-orange-600 text-white"
                    : "bg-accent/50 text-gray-400 hover:bg-accent"
                }`}
              >
                {sort}
              </button>
            ))}
          </div>
        </div>
      )}
      
      <div className="flex flex-col space-y-4">
        {posts.map((post) => (
          <div key={post.id} className="bg-card border rounded-xl shadow-sm hover:border-orange-500/20 transition-all group">
            <div className="flex">
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
              <div className="p-4 flex-1 cursor-pointer" onClick={() => navigate(`/post/${post.id}`)}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground mb-2">
                  <div className="flex items-center space-x-1">
                    <div className="w-4 h-4 bg-orange-600 rounded-full overflow-hidden">
                      {profiles[post.pubkey]?.image && (
                        <img src={profiles[post.pubkey].image} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <span className="font-bold text-foreground lowercase">r/nostr</span>
                  </div>
                  <span>•</span>
                  <span className="hover:underline font-medium text-foreground">
                    {profiles[post.pubkey]?.displayName || profiles[post.pubkey]?.name || post.pubkey.slice(0, 8)}
                  </span>
                  <span>•</span>
                  <span>{new Date(post.created_at! * 1000).toLocaleTimeString()}</span>
                </div>
                
                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed mb-4">
                  {post.content}
                </div>

                {/* Voter List */}
                {(postVoters[post.id]?.up.length > 0 || postVoters[post.id]?.down.length > 0) && (
                  <div className="mb-4 flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-muted-foreground mr-1 uppercase font-bold tracking-wider">Voters:</span>
                    {postVoters[post.id]?.up.slice(0, 5).map(pk => (
                      <span key={pk} className="text-[10px] px-1.5 py-0.5 bg-orange-500/10 text-orange-600 rounded-sm border border-orange-500/20">
                        {profiles[pk]?.name || pk.slice(0, 4)} (up)
                      </span>
                    ))}
                    {postVoters[post.id]?.down.slice(0, 5).map(pk => (
                      <span key={pk} className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-600 rounded-sm border border-blue-500/20">
                        {profiles[pk]?.name || pk.slice(0, 4)} (down)
                      </span>
                    ))}
                    {(postVoters[post.id]?.up.length + postVoters[post.id]?.down.length) > 10 && (
                      <span className="text-[10px] text-muted-foreground italic">
                        +{(postVoters[post.id].up.length + postVoters[post.id].down.length) - 10} more
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setReplyingTo(replyingTo === post.id ? null : post.id);
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <MessageSquare size={16} />
                    <span className="text-xs font-bold">Reply</span>
                  </button>
                  
                  {/* Comment Count */}
                  <div 
                    className="flex items-center space-x-1.5 px-3 py-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/post/${post.id}`);
                    }}
                  >
                    <MessageSquare size={16} />
                    <span className="text-xs font-bold">
                      {commentCounts[post.id] !== undefined ? `${commentCounts[post.id]} comments` : "View comments"}
                    </span>
                  </div>
                  
                  <button 
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center space-x-1.5 px-3 py-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Share2 size={16} />
                    <span className="text-xs font-bold">Share</span>
                  </button>
                  
                  {/* Save Button */}
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    className="px-3 py-1.5"
                  >
                    <SavePostButton post={post} size="sm" />
                  </div>
                  
                  {/* Zap Button */}
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    className="px-3 py-1.5"
                  >
                    <ZapButton 
                      targetPubkey={post.pubkey} 
                      eventId={post.id}
                      size="sm"
                    />
                  </div>
                  
                  <button 
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>

                {replyingTo === post.id && (
                  <div className="mt-4 space-y-3 p-3 bg-accent/20 rounded-lg" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Write your reply..."
                      className="w-full bg-background border rounded-lg p-2 text-sm focus:ring-1 focus:ring-orange-500 min-h-[80px] inherit"
                    />
                    <div className="flex justify-end space-x-2">
                      <button 
                        onClick={() => setReplyingTo(null)}
                        className="px-4 py-1.5 text-xs font-bold hover:bg-accent rounded-full transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => handleReply(post)}
                        disabled={!replyContent.trim()}
                        className="px-4 py-1.5 bg-orange-600 text-white rounded-full text-xs font-bold hover:bg-orange-700 disabled:opacity-50"
                      >
                        Post Reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  return (
    <NostrProvider>
      <Router>
        <AppShell>
          <Routes>
            <Route path="/" element={<Feed />} />
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
  );
}

export default App;
