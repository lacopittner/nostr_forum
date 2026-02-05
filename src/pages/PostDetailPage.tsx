import { useNostr } from "../providers/NostrProvider";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { ArrowLeft, ArrowBigUp, ArrowBigDown, MessageSquare, Send } from "lucide-react";
import { CommentThread } from "../components/CommentThread";

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
  
  // Reply state
  const [replyContent, setReplyContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  
  // Voting state
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [userVotes, setUserVotes] = useState<Record<string, "UPVOTE" | "DOWNVOTE" | null>>({});
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  
  const seenEventIds = useRef(new Set<string>());
  const reactionMap = useRef<Record<string, Record<string, { id: string; content: string; created_at: number }>>>({});
  const votingLock = useRef(new Set<string>());
  const commentsMap = useRef(new Map<string, NDKEvent>());

  const fetchProfile = useCallback(async (pubkey: string) => {
    if (profiles[pubkey]) return;
    try {
      const profile = await ndk.getUser({ pubkey }).fetchProfile();
      if (profile) {
        setProfiles(prev => ({ ...prev, [pubkey]: profile }));
      }
    } catch (e) {}
  }, [ndk, profiles]);

  const updateScores = useCallback(() => {
    const newScores: Record<string, number> = {};
    const newUserVotes: Record<string, "UPVOTE" | "DOWNVOTE" | null> = {};

    for (const [id, users] of Object.entries(reactionMap.current)) {
      let score = 0;
      for (const [pubkey, reaction] of Object.entries(users)) {
        if (reaction.content === "NEUTRAL") continue;
        const isDown = reaction.content === "DOWNVOTE" || reaction.content === "-";
        score += isDown ? -1 : 1;
        if (user && pubkey === user.pubkey) {
          newUserVotes[id] = isDown ? "DOWNVOTE" : "UPVOTE";
        }
      }
      newScores[id] = score;
    }
    setReactions(newScores);
    setUserVotes(newUserVotes);
  }, [user?.pubkey]);

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

    commentSub.on("eose", () => {
      buildCommentTree();
      setIsLoading(false);
    });

    // Fetch post reactions
    ndk.subscribe(
      { kinds: [NDKKind.Reaction], "#e": [postId] },
      { closeOnEose: true }
    ).on("event", (event: NDKEvent) => {
      if (!reactionMap.current[postId]) reactionMap.current[postId] = {};
      const existing = reactionMap.current[postId][event.pubkey];
      if (!existing || event.created_at! > existing.created_at) {
        reactionMap.current[postId][event.pubkey] = {
          id: event.id,
          content: event.content,
          created_at: event.created_at!
        };
        updateScores();
      }
    });

    return () => {
      commentSub.stop();
    };
  }, [ndk, postId, fetchProfile, updateScores]);

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
      console.error("Failed to publish reply", error);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleReaction = async (targetId: string, targetPubkey: string, type: "UPVOTE" | "DOWNVOTE") => {
    if (!user || votingLock.current.has(targetId)) return;

    const lastReaction = reactionMap.current[targetId]?.[user.pubkey];
    const lastContent = lastReaction?.content;
    const isCurrentlyUp = lastContent === "UPVOTE" || lastContent === "+";
    const isCurrentlyDown = lastContent === "DOWNVOTE" || lastContent === "-";
    const isUndoing = (type === "UPVOTE" && isCurrentlyUp) || (type === "DOWNVOTE" && isCurrentlyDown);

    votingLock.current.add(targetId);
    setVotingIds(prev => new Set(prev).add(targetId));

    try {
      if (isUndoing && lastReaction?.id) {
        const deletion = new NDKEvent(ndk);
        deletion.kind = 5;
        deletion.content = "Unvoting";
        deletion.tags = [["e", lastReaction.id]];
        await deletion.publish();
        delete reactionMap.current[targetId][user.pubkey];
      } else {
        const reaction = new NDKEvent(ndk);
        reaction.kind = NDKKind.Reaction;
        reaction.content = type === "UPVOTE" ? "+" : "-";
        reaction.tags = [["e", targetId], ["p", targetPubkey]];
        await reaction.publish();
        
        if (!reactionMap.current[targetId]) reactionMap.current[targetId] = {};
        reactionMap.current[targetId][user.pubkey] = {
          id: reaction.id,
          content: reaction.content,
          created_at: Math.floor(Date.now() / 1000)
        };
      }
      updateScores();
    } catch (error) {
      console.error("Reaction failed", error);
    } finally {
      votingLock.current.delete(targetId);
      setVotingIds(prev => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
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
              onClick={() => handleReaction(post.id, post.pubkey, "UPVOTE")}
              disabled={votingIds.has(post.id)}
              className={`transition-colors ${userVotes[post.id] === "UPVOTE" ? "text-orange-600" : "text-muted-foreground hover:text-orange-600"}`}
            >
              <ArrowBigUp size={24} fill={userVotes[post.id] === "UPVOTE" ? "currentColor" : "none"} />
            </button>
            <span className={`text-[13px] font-black ${userVotes[post.id] === "UPVOTE" ? "text-orange-600" : userVotes[post.id] === "DOWNVOTE" ? "text-blue-600" : ""}`}>
              {reactions[post.id] || 0}
            </span>
            <button
              onClick={() => handleReaction(post.id, post.pubkey, "DOWNVOTE")}
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
                onVote={handleReaction}
                onReply={(parentId, _parentPubkey, content) => {
                  // Handle nested reply
                  console.log("Reply to", parentId, content);
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
