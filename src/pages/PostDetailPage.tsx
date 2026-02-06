import { useNostr } from "../providers/NostrProvider";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { ArrowLeft, ArrowBigUp, ArrowBigDown, MessageSquare, Send, AlertCircle, Loader2, MoreHorizontal, Share2, Trash2, Edit3 } from "lucide-react";
import { CommentThread } from "../components/CommentThread";
import { useVoting } from "../hooks/useVoting";
import { PostContent } from "../components/PostContent";
import { ZapButton } from "../components/ZapButton";
import { SavePostButton } from "../components/SavePostButton";
import { logger } from "../lib/logger";
import { useToast } from "../lib/toast";

interface Comment {
  event: NDKEvent;
  replies: Comment[];
}

export function PostDetailPage() {
  const { ndk, user } = useNostr();
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  
  const [post, setPost] = useState<NDKEvent | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"new" | "top">("new");
  const [replyError, setReplyError] = useState<string | null>(null);
  
  // Reply state
  const [replyContent, setReplyContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  
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
      logger.error("Failed to fetch profile:", pubkey, e);
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
        logger.error("Failed to fetch post", error); showError("Failed to load post. Please try again.");
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
      
      success("Reply published successfully!");
    } catch (error) {
      logger.error("Failed to publish reply:", error); showError("Failed to publish reply. Please try again.");
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
      logger.error("Failed to publish nested reply:", error); showError("Failed to publish reply. Please try again.");
      setReplyError("Failed to publish reply. Check your relay connection.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;
    
    try {
      // Create deletion event (Kind 5)
      const deletion = new NDKEvent(ndk);
      deletion.kind = 5;
      deletion.content = "Deleted by author";
      deletion.tags = [["e", commentId]];
      
      await deletion.publish();
      
      // Remove from local state
      const removeComment = (commentList: Comment[]): Comment[] => {
        return commentList
          .filter(c => c.event.id !== commentId)
          .map(c => ({
            ...c,
            replies: removeComment(c.replies)
          }));
      };
      
      setComments(prev => removeComment(prev));
    } catch (error) {
      logger.error("Failed to delete comment", error); showError("Failed to delete comment. Please try again.");
      alert("Failed to delete comment");
    }
  };

  const handleDeletePost = async () => {
    if (!user || !post) return;
    if (post.pubkey !== user.pubkey) {
      showError("You can only delete your own posts");
      return;
    }
    
    if (!confirm("Are you sure you want to delete this post?")) return;
    
    try {
      const deletion = new NDKEvent(ndk);
      deletion.kind = 5;
      deletion.content = "Deleted by author";
      deletion.tags = [["e", post.id]];
      
      await deletion.publish();
      success("Post deleted");
      navigate(-1);
    } catch (error) {
      logger.error("Failed to delete post", error);
      showError("Failed to delete post");
    }
  };

  const handleEditPost = async () => {
    if (!user || !post) return;
    if (post.pubkey !== user.pubkey) {
      showError("You can only edit your own posts");
      return;
    }
    
    if (!editContent.trim()) return;
    
    try {
      const editEvent = new NDKEvent(ndk);
      editEvent.kind = NDKKind.Text;
      editEvent.content = editContent;
      editEvent.tags = post.tags.filter(t => t[0] !== "e"); // Keep all tags except thread refs
      
      await editEvent.publish();
      // Update the post content directly on the existing object
      if (post) {
        post.content = editContent;
        setPost(post); // Use same object to preserve type
      }
      setIsEditing(false);
      success("Post updated");
    } catch (error) {
      logger.error("Failed to edit post", error);
      showError("Failed to edit post");
    }
  };

  const isOwnPost = user && post && post.pubkey === user.pubkey;
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    
    if (showActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showActionsMenu]);

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
          className="px-6 py-2 bg-[var(--primary)] text-white rounded-full font-bold hover:bg-[var(--primary-dark)]"
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
        className="flex items-center space-x-2 text-[var(--primary)] hover:text-[var(--primary)] transition-colors"
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
              className={`transition-colors ${userVotes[post.id] === "UPVOTE" ? "text-[var(--primary)]" : "text-muted-foreground hover:text-[var(--primary)]"}`}
            >
              <ArrowBigUp size={24} fill={userVotes[post.id] === "UPVOTE" ? "currentColor" : "none"} />
            </button>
            <span className={`text-[13px] font-black ${userVotes[post.id] === "UPVOTE" ? "text-[var(--primary)]" : userVotes[post.id] === "DOWNVOTE" ? "text-blue-600" : ""}`}>
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
              
              {/* Actions menu */}
              <div className="relative ml-auto" ref={actionsMenuRef}>
                <button
                  onClick={() => setShowActionsMenu(!showActionsMenu)}
                  className="p-1.5 hover:bg-accent rounded-full transition-colors"
                >
                  <MoreHorizontal size={16} />
                </button>
                
                {showActionsMenu && (
                  <div className="absolute right-0 top-full mt-1 w-40 bg-card border rounded-lg shadow-lg z-10 py-1">
                    {isOwnPost ? (
                      <>
                        <button
                          onClick={() => {
                            setIsEditing(true);
                            setEditContent(post.content);
                            setShowActionsMenu(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                        >
                          <Edit3 size={14} />
                          Edit Post
                        </button>
                        <button
                          onClick={() => {
                            handleDeletePost();
                            setShowActionsMenu(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-accent text-red-500 flex items-center gap-2"
                        >
                          <Trash2 size={14} />
                          Delete Post
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.href);
                            success("Link copied to clipboard");
                            setShowActionsMenu(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                        >
                          <Share2 size={14} />
                          Share Post
                        </button>
                        <button
                          onClick={() => {
                            alert("Report feature coming soon");
                            setShowActionsMenu(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-accent text-muted-foreground"
                        >
                          Report Post
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Edit mode */}
            {isEditing ? (
              <div className="space-y-3">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-accent/50 border rounded-lg p-3 text-sm min-h-[150px]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-sm font-bold hover:bg-accent rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditPost}
                    disabled={!editContent.trim()}
                    className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-bold rounded-lg hover:bg-[var(--primary-dark)] disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <PostContent content={post.content} />
                </div>
                
                {/* Action bar */}
                <div className="flex items-center gap-1 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-muted-foreground text-xs font-bold">
                    <MessageSquare size={16} />
                    <span>{totalComments} comments</span>
                  </div>
                  
                  <button className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground text-xs font-bold">
                    <Share2 size={16} />
                    <span>Share</span>
                  </button>
                  
                  <div className="flex items-center">
                    <SavePostButton post={post} size="sm" />
                  </div>
                  
                  <div className="flex items-center">
                    <ZapButton 
                      targetPubkey={post.pubkey} 
                      eventId={post.id}
                      size="sm"
                      showText={true}
                    />
                  </div>
                </div>
              </>
            )}
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
            className="w-full bg-accent/50 border-none rounded-lg p-3 text-sm focus:ring-1 focus:ring-[var(--primary)] min-h-[100px] resize-none"
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => handleReply()}  // Call without args for root reply
              disabled={isPublishing || !replyContent.trim()}
              className="flex items-center space-x-2 px-6 py-2 bg-[var(--primary)] text-white rounded-full font-bold text-sm hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-all"
            >
              {isPublishing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Posting...</span>
                </>
              ) : (
                <>
                  <Send size={16} />
                  <span>Comment</span>
                </>
              )}
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
              className="bg-accent/50 border-none rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-[var(--primary)]"
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
                onDelete={handleDeleteComment}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
