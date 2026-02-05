import { useNostr } from "../providers/NostrProvider";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { ArrowLeft, ArrowBigUp, ArrowBigDown, MessageSquare, Send, AlertCircle } from "lucide-react";
import { CommentThread } from "../components/CommentThread";
import { useVoting } from "../hooks/useVoting";

interface Comment {
  event: NDKEvent;
  replies: Comment[];
}

export function PostDetailPage() {
  const { ndk, user } = useNostr();
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  
  const [post, setPost] = useState<NDKEvent | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"new" | "top">("new");
  const [replyError, setReplyError] = useState<string | null>(null);
  
  // Reply state
  const [replyContent, setReplyContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  
  // Voting - use the custom hook instead of duplicating logic
  const { reactions, userVotes, votingIds, error: votingError, handleReaction, processIncomingReaction, processIncomingDeletion } = useVoting();
  
  // Profile fetching
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const profileFetchQueue = useRef(new Set<string>());
  
  const seenEventIds = useRef(new Set<string>());
  const commentsMap = useRef(new Map<string, NDKEvent>());

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



  // Fetch post
  useEffect(() => {
    if (!postId) return;
    
    const fetchPost = async () => {
      try {
        const fetchedPost = await ndk.fetchEvent({ ids: [postId] });
        if (fetchedPost) {
          setPost(fetchedPost);
          fetchProfile(fetchedPost.pubkey);
        }
      } catch (error) {
        console.error("Failed to fetch post", error);
      }
    };

    fetchPost();
  }, [ndk, postId, fetchProfile]);

  // Fetch comments and reactions
  useEffect(() => {
    if (!postId) return;

    setIsLoading(true);
    commentsMap.current.clear();

    // Fetch comments
    const commentSub = ndk.subscribe(
      { kinds: [NDKKind.Text], "#e": [postId], limit: 200 },
      { closeOnEose: true }
    );

    commentSub.on("event", (event: NDKEvent) => {
      if (seenEventIds.current.has(event.id)) return;
      seenEventIds.current.add(event.id);
      
      commentsMap.current.set(event.id, event);
      fetchProfile(event.pubkey);
      
      // Subscribe to reactions for this comment
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
    });

    commentSub.on("eose", () => {
      buildCommentTree();
      setIsLoading(false);
    });

    // Fetch post reactions
    ndk.subscribe(
      { kinds: [NDKKind.Reaction], "#e": [postId] },
      { closeOnEose: true }
    ).on("event", (event: NDKEvent) => {
      processIncomingReaction(event);
    });

    return () => {
      commentSub.stop();
    };
  }, [ndk, postId, fetchProfile, processIncomingReaction, processIncomingDeletion]);

  const buildCommentTree = () => {
    const commentList = Array.from(commentsMap.current.values());
    const commentMap = new Map<string, Comment>();
    
    // Create Comment objects
    commentList.forEach(event => {
      commentMap.set(event.id, { event, replies: [] });
    });
    
    const rootComments: Comment[] = [];
    
    // Build tree structure
    commentList.forEach(event => {
      const comment = commentMap.get(event.id)!;
      
      // Find parent
      const replyTag = event.tags.find(t => t[0] === "e" && t[3] === "reply");
      const parentId = replyTag?.[1];
      
      if (parentId && commentMap.has(parentId)) {
        const parent = commentMap.get(parentId)!;
        parent.replies.push(comment);
      } else {
        rootComments.push(comment);
      }
    });
    
    // Sort based on selected option
    const sortedComments = sortComments(rootComments, sortBy);
    setComments(sortedComments);
  };

  const sortComments = (commentList: Comment[], sort: "new" | "top"): Comment[] => {
    return commentList.sort((a, b) => {
      if (sort === "new") {
        return (b.event.created_at || 0) - (a.event.created_at || 0);
      } else {
        // Sort by score (top)
        const scoreA = reactions[a.event.id] || 0;
        const scoreB = reactions[b.event.id] || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (b.event.created_at || 0) - (a.event.created_at || 0);
      }
    }).map(comment => ({
      ...comment,
      replies: sortComments(comment.replies, sort)
    }));
  };

  useEffect(() => {
    buildCommentTree();
  }, [sortBy, reactions]);

  const handleReply = async (parentId?: string, parentPubkey?: string, content?: string) => {
    const replyText = content || replyContent;
    const targetId = parentId || post?.id;
    const targetPubkey = parentPubkey || post?.pubkey;
    
    if (!replyText?.trim() || !user || !post || !targetId || !targetPubkey || isPublishing) return;

    setIsPublishing(true);
    setReplyError(null);
    
    try {
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;
      event.content = replyText;
      
      // NIP-10 threading: always reference root post
      // NIP-10 compliant threading:
      // - "root" always references the original post
      // - "reply" references the immediate parent (for nested replies)
      event.tags = [
        ["e", post.id, "", "root"],  // Root is always the original post
        ["p", post.pubkey]
      ];
      
      // If replying to a comment (not root), add reply marker
      if (parentId && parentId !== post.id) {
        event.tags.push(["e", parentId, "", "reply"]);
        if (parentPubkey) {
          // Add p tag for parent author if different from root author
          const hasParentPubkey = event.tags.some(t => t[0] === "p" && t[1] === parentPubkey);
          if (!hasParentPubkey) {
            event.tags.push(["p", parentPubkey]);
          }
        }
      }
      
      await event.publish();
      
      if (!content) {
        // Only clear if it's the main reply box
        setReplyContent("");
      }
      
      // Add to comments immediately
      const newComment: Comment = { event, replies: [] };
      setComments(prev => [newComment, ...prev]);
    } catch (error) {
      console.error("Failed to publish reply:", error);
      setReplyError("Failed to publish reply. Check your relay connection.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleVote = (targetId: string, targetPubkey: string, type: "UPVOTE" | "DOWNVOTE") => {
    // Create a synthetic NDKEvent for voting
    const event = new NDKEvent(ndk);
    event.id = targetId;
    event.pubkey = targetPubkey;
    handleReaction(event, type);
  };

  const handleNestedReply = async (parentId: string, parentPubkey: string, content: string) => {
    if (!content.trim() || !user || !post || !parentId || !parentPubkey) return;

    setIsPublishing(true);
    setReplyError(null);
    
    try {
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;
      event.content = content;
      
      // NIP-10 threading
      event.tags = [
        ["e", post.id, "", "root"],
        ["p", post.pubkey],
        ["e", parentId, "", "reply"],
        ["p", parentPubkey]
      ];
      
      await event.publish();
      
      // Refresh comments to show the new reply
      const newComment: Comment = { event, replies: [] };
      setComments(prev => {
        // Add to the correct parent
        const updateReplies = (commentList: Comment[]): Comment[] => {
          return commentList.map(comment => {
            if (comment.event.id === parentId) {
              return { ...comment, replies: [...comment.replies, newComment] };
            }
            if (comment.replies.length > 0) {
              return { ...comment, replies: updateReplies(comment.replies) };
            }
            return comment;
          });
        };
        return updateReplies(prev);
      });
    } catch (error) {
      console.error("Failed to publish nested reply:", error);
      setReplyError("Failed to publish reply. Check your relay connection.");
    } finally {
      setIsPublishing(false);
    }
  };

  const getTotalCommentCount = (commentList: Comment[]): number => {
    return commentList.reduce((acc, comment) => {
      return acc + 1 + getTotalCommentCount(comment.replies);
    }, 0);
  };

  if (isLoading && !post) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-400">Loading post...</div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
        <p className="text-gray-400 mb-4">Post not found</p>
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 bg-orange-600 text-white rounded-full font-bold hover:bg-orange-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  const totalComments = getTotalCommentCount(comments);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center space-x-2 text-orange-500 hover:text-orange-600 transition-colors"
      >
        <ArrowLeft size={20} />
        <span>Back</span>
      </button>

      {/* Post */}
      <div className="bg-card border rounded-xl shadow-sm">
        <div className="flex">
          {/* Voting */}
          <div className="w-12 bg-accent/30 flex flex-col items-center py-4 space-y-1 rounded-l-xl">
            <button
              onClick={() => handleVote(post.id, post.pubkey, "UPVOTE")}
              disabled={votingIds.has(post.id)}
              className={`transition-colors ${userVotes[post.id] === "UPVOTE" ? "text-orange-600" : "text-muted-foreground hover:text-orange-600"}`}
            >
              <ArrowBigUp size={24} fill={userVotes[post.id] === "UPVOTE" ? "currentColor" : "none"} />
            </button>
            <span className={`text-[13px] font-black ${userVotes[post.id] === "UPVOTE" ? "text-orange-600" : userVotes[post.id] === "DOWNVOTE" ? "text-blue-600" : ""}`}>
              {reactions[post.id] || 0}
            </span>
            <button
              onClick={() => handleVote(post.id, post.pubkey, "DOWNVOTE")}
              disabled={votingIds.has(post.id)}
              className={`transition-colors ${userVotes[post.id] === "DOWNVOTE" ? "text-blue-600" : "text-muted-foreground hover:text-blue-600"}`}
            >
              <ArrowBigDown size={24} fill={userVotes[post.id] === "DOWNVOTE" ? "currentColor" : "none"} />
            </button>
          </div>

          <div className="p-4 flex-1">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
              <span className="font-mono">{post.pubkey.slice(0, 12)}...</span>
              <span>•</span>
              <span>{new Date((post.created_at || 0) * 1000).toLocaleString()}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{post.content}</p>
          </div>
        </div>
      </div>

      {/* Reply Box */}
      {user && (
        <div className="bg-card border rounded-xl p-4 shadow-sm">
          {replyError && (
            <div className="mb-3 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle size={16} />
              <span>{replyError}</span>
            </div>
          )}
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="What are your thoughts?"
            className="w-full bg-accent/50 border-none rounded-lg p-3 text-sm focus:ring-1 focus:ring-orange-500 min-h-[100px] resize-none"
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => handleReply()}  // Call without args for root reply
              disabled={isPublishing || !replyContent.trim()}
              className="flex items-center space-x-2 px-6 py-2 bg-orange-600 text-white rounded-full font-bold text-sm hover:bg-orange-700 disabled:opacity-50 transition-all"
            >
              <Send size={16} />
              <span>{isPublishing ? "Posting..." : "Comment"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Comments Section */}
      <div className="space-y-4">
        {votingError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertCircle size={16} />
            <span>{votingError}</span>
          </div>
        )}
        
        {/* Header with count and sort */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={20} className="text-gray-400" />
            <span className="font-bold">{totalComments} Comments</span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "new" | "top")}
              className="bg-accent/50 border-none rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-orange-500"
            >
              <option value="new">New</option>
              <option value="top">Top</option>
            </select>
          </div>
        </div>

        {/* Comment Tree */}
        {comments.length === 0 ? (
          <div className="bg-card border rounded-xl p-8 text-center shadow-sm">
            <p className="text-gray-400">No comments yet. Be the first to share your thoughts!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentThread
                key={comment.event.id}
                comment={comment}
                reactions={reactions}
                userVotes={userVotes}
                votingIds={votingIds}
                profiles={profiles}
                onVote={handleVote}
                onReply={(parentId, parentPubkey, content) => {
                  handleNestedReply(parentId, parentPubkey, content);
                }}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
