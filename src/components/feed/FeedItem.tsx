import { useCallback } from "react";
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { ArrowBigDown, ArrowBigUp, Loader2, MessageSquare, Share2 } from "lucide-react";
import { SavePostButton } from "../SavePostButton";
import { ZapButton } from "../ZapButton";
import { PostContent } from "../PostContent";
import { PostActionsMenu } from "../PostActionsMenu";
import { NDKProfile } from "../../lib/types";

interface FeedItemProps {
  post: NDKEvent;
  profile?: NDKProfile;
  reactionScore: number;
  userVote?: "UPVOTE" | "DOWNVOTE" | null;
  isVoting: boolean;
  commentCount: number;
  isReplying: boolean;
  replyContent: string;
  isReplyPublishing: boolean;
  onOpenPost: (postId: string) => void;
  onVote: (post: NDKEvent, type: "UPVOTE" | "DOWNVOTE") => void;
  onToggleReply: (postId: string) => void;
  onReplyContentChange: (value: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (post: NDKEvent) => void;
  onEditPost: (postId: string, newContent: string) => Promise<void> | void;
  onDeletePost: (postId: string) => Promise<void> | void;
}

export function FeedItem({
  post,
  profile,
  reactionScore,
  userVote,
  isVoting,
  commentCount,
  isReplying,
  replyContent,
  isReplyPublishing,
  onOpenPost,
  onVote,
  onToggleReply,
  onReplyContentChange,
  onCancelReply,
  onSubmitReply,
  onEditPost,
  onDeletePost,
}: FeedItemProps) {
  const handleOpenPost = useCallback(() => {
    onOpenPost(post.id);
  }, [onOpenPost, post.id]);

  const stopPropagation = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.stopPropagation();
  }, []);

  const handleUpvote = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onVote(post, "UPVOTE");
    },
    [onVote, post]
  );

  const handleDownvote = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onVote(post, "DOWNVOTE");
    },
    [onVote, post]
  );

  const handleCommentClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onOpenPost(post.id);
    },
    [onOpenPost, post.id]
  );

  const handleToggleReply = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onToggleReply(post.id);
    },
    [onToggleReply, post.id]
  );

  const handleReplyChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onReplyContentChange(event.target.value);
    },
    [onReplyContentChange]
  );

  const handleCancelReply = useCallback(() => {
    onCancelReply();
  }, [onCancelReply]);

  const handleSubmitReply = useCallback(() => {
    onSubmitReply(post);
  }, [onSubmitReply, post]);

  const authorName = profile?.displayName || profile?.name || `npub...${post.pubkey.slice(-8)}`;

  return (
    <article
      className="bg-card border border-border/50 hover:border-[var(--primary)]/30 transition-colors group cursor-pointer"
      onClick={handleOpenPost}
    >
      <div className="flex">
        <div className="w-10 bg-accent/20 flex flex-col items-center py-2 space-y-0.5">
          <button
            onClick={handleUpvote}
            disabled={isVoting}
            className={`p-1 rounded transition-colors ${userVote === "UPVOTE" ? "text-[var(--primary)]" : "text-muted-foreground hover:bg-accent hover:text-[var(--primary)]"} ${isVoting ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <ArrowBigUp size={22} fill={userVote === "UPVOTE" ? "currentColor" : "none"} />
          </button>
          <span
            className={`text-xs font-bold ${
              userVote === "UPVOTE"
                ? "text-[var(--primary)]"
                : userVote === "DOWNVOTE"
                  ? "text-blue-600"
                  : "text-muted-foreground"
            }`}
          >
            {reactionScore}
          </span>
          <button
            onClick={handleDownvote}
            disabled={isVoting}
            className={`p-1 rounded transition-colors ${userVote === "DOWNVOTE" ? "text-blue-600" : "text-muted-foreground hover:bg-accent hover:text-blue-600"} ${isVoting ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <ArrowBigDown size={22} fill={userVote === "DOWNVOTE" ? "currentColor" : "none"} />
          </button>
        </div>

        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <span className="font-bold text-foreground/80 hover:underline">r/nostr</span>
            <span>•</span>
            <span className="hover:underline">Posted by</span>
            <span className="hover:underline text-foreground/60">{authorName}</span>
            <span>•</span>
            <span>{new Date((post.created_at || 0) * 1000).toLocaleDateString()}</span>
          </div>

          <div className="mb-3">
            <PostContent content={post.content} maxLines={6} />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCommentClick}
              className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground text-xs font-bold"
            >
              <MessageSquare size={16} />
              <span>{`${commentCount} comments`}</span>
            </button>

            <button
              onClick={handleToggleReply}
              className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground text-xs font-bold"
            >
              <MessageSquare size={16} />
              <span>Reply</span>
            </button>

            <button
              onClick={stopPropagation}
              className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground text-xs font-bold"
            >
              <Share2 size={16} />
              <span>Share</span>
            </button>

            <div onClick={stopPropagation} className="flex items-center">
              <SavePostButton post={post} size="sm" />
            </div>

            <div onClick={stopPropagation} className="flex items-center">
              <ZapButton targetPubkey={post.pubkey} eventId={post.id} size="sm" />
            </div>

            <div className="ml-auto" onClick={stopPropagation}>
              <PostActionsMenu post={post} onEdit={onEditPost} onDelete={onDeletePost} />
            </div>
          </div>

          {isReplying && (
            <div className="mt-3 pt-3 border-t border-border/50" onClick={stopPropagation}>
              <div className="space-y-2">
                <textarea
                  value={replyContent}
                  onChange={handleReplyChange}
                  placeholder="What are your thoughts?"
                  className="w-full bg-background border border-border rounded-md p-2.5 text-sm focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)] min-h-[100px] resize-y"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleCancelReply}
                    className="px-4 py-1.5 text-xs font-bold hover:bg-accent rounded-full transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitReply}
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
  );
}
