import { NostrProvider, useNostr } from "./providers/NostrProvider";
import { AppShell } from "./components/layout/AppShell";
import { ArrowBigUp, ArrowBigDown, MessageSquare, Share2, MoreHorizontal, Send, AlertCircle, Loader2 } from "lucide-react";
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
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { InfiniteScroll } from "./components/InfiniteScroll";
import { PostContent } from "./components/PostContent";
import { ToastContainer } from "./components/Toast";
import { useVoting } from "./hooks/useVoting";
import { logger } from "./lib/logger";
import { useToast } from "./lib/toast";

function Feed() {
  const { ndk, user } = useNostr();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [posts, setPosts] = useState<NDKEvent[]>([]);
  const [newPostContent, setNewPostContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [commentCounts] = useState<Record<string, number>>({});
  const [sortBy, setSortBy] = useState<"hot" | "new" | "top">("new");
  
  // Infinite scroll state
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [until, setUntil] = useState<number | undefined>(undefined);
  const POSTS_PER_PAGE = 20;

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

  const handleCreatePost = async () => {
    if (!newPostContent.trim() || !user || isPublishing) return;

    setIsPublishing(true);
    setPostError(null);
    
    try {
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;
      event.content = newPostContent;
      event.tags = [["t", "nostr"], ["a", "34550:global:community"]];
      await event.publish();
      setNewPostContent("");
      success("Post published successfully!");
    } catch (error) {
      logger.error("Failed to publish post:", error);
      setPostError("Failed to publish post. Check your relay connection.");
      showError("Failed to publish post. Check your relay connection.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleVote = (post: NDKEvent, type: "UPVOTE" | "DOWNVOTE") => {
    handleReaction(post, type);
  };

  const handleReply = async (post: NDKEvent) => {
    if (!replyContent.trim() || !user || isPublishing) return;

    setIsPublishing(true);
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
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Post Area */}
      {user && (
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

      {/* Posts with Infinite Scroll */}
      <div className="space-y-4">
        {votingError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertCircle size={16} />
            <span>{votingError}</span>
          </div>
        )}
        
        {posts.length === 0 && !isLoadingMore && (
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
      
        <InfiniteScroll
          onLoadMore={loadMore}
          hasMore={hasMore}
          isLoading={isLoadingMore}
        >
          <div className="flex flex-col space-y-4">
            {posts.map((post) => (
              <div key={post.id} className="bg-card border rounded-xl shadow-sm hover:border-orange-500/20 transition-all group">
                <div className="flex">
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
                    
                    <div className="mb-4">
                      <PostContent content={post.content} maxLines={8} />
                    </div>

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
                      
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1.5"
                      >
                        <SavePostButton post={post} size="sm" />
                      </div>
                      
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
                            disabled={!replyContent.trim() || isPublishing}
                            className="flex items-center gap-2 px-4 py-1.5 bg-orange-600 text-white rounded-full text-xs font-bold hover:bg-orange-700 disabled:opacity-50"
                          >
                            {isPublishing ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                Posting...
                              </>
                            ) : (
                              "Post Reply"
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
