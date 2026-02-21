import { useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { ArrowBigUp, ArrowBigDown, MessageSquare, CornerDownRight, Trash2, HelpCircle } from "lucide-react";
import { useNostr } from "../providers/NostrProvider";

import { NDKProfile } from "../lib/types";
import { MarkdownContent } from "./MarkdownContent";

interface Comment {
  event: NDKEvent;
  replies: Comment[];
}

interface CommentThreadProps {
  comment: Comment;
  reactions: Record<string, number>;
  userVotes: Record<string, "UPVOTE" | "DOWNVOTE" | null>;
  votingIds: Set<string>;
  profiles: Record<string, NDKProfile>;
  onVote: (targetId: string, targetPubkey: string, type: "UPVOTE" | "DOWNVOTE") => void;
  onReply: (parentId: string, parentPubkey: string, content: string) => void;
  onDelete?: (commentId: string) => void;
  depth: number;
}

export function CommentThread({
  comment,
  reactions,
  userVotes,
  votingIds,
  profiles,
  onVote,
  onReply,
  onDelete,
  depth
}: CommentThreadProps) {
  const { user } = useNostr();
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const event = comment.event;
  const score = reactions[event.id] || 0;
  const userVote = userVotes[event.id];
  const profile = profiles[event.pubkey];
  
  const maxDepth = 6;
  const isDeep = depth >= maxDepth;
  const isOwner = user?.pubkey === event.pubkey;
  
  const handleReplySubmit = () => {
    if (!replyContent.trim()) return;
    onReply(event.id, event.pubkey, replyContent);
    setReplyContent("");
    setIsReplying(false);
  };

  const handleDelete = () => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    onDelete?.(event.id);
  };

  const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp * 1000) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className={`${depth > 0 ? "ml-4 border-l-2 border-accent pl-4" : ""}`}>
      <div className="bg-card/50 rounded-lg p-3 hover:bg-accent/20 transition-colors">
        {/* Comment Header */}
        <div className="flex items-center gap-2 text-xs mb-2">
          <div className="w-6 h-6 bg-[var(--primary)]/20 rounded-full overflow-hidden flex items-center justify-center">
            {profile?.image ? (
              <img src={profile.image} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] font-bold text-[var(--primary)]">
                {event.pubkey.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          
          <span className="font-bold text-[var(--primary)]">
            {profile?.name || event.pubkey.slice(0, 8)}...
          </span>
          
          <span className="text-gray-500">•</span>
          
          <span className="text-gray-500">
            {formatTimeAgo(event.created_at || 0)}
          </span>
          
          {score !== 0 && (
            <>
              <span className="text-gray-500">•</span>
              <span className={`font-bold ${score > 0 ? "text-[var(--primary)]" : "text-blue-500"}`}>
                {score > 0 ? "+" : ""}{score} points
              </span>
            </>
          )}
          
          {comment.replies.length > 0 && (
            <>
              <span className="text-gray-500">•</span>
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="text-gray-500 hover:text-[var(--primary)] transition-colors"
              >
                {isCollapsed ? `Show ${comment.replies.length} replies` : "Collapse"}
              </button>
            </>
          )}
        </div>

        {/* Comment Content */}
        <div className="text-sm mb-3 pl-8">
          <div className="[&_.prose]:max-w-none [&_.prose]:text-sm">
            <MarkdownContent content={event.content} />
          </div>
        </div>

        {/* Comment Actions */}
        <div className="flex items-center gap-4 pl-8">
          {/* Voting */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onVote(event.id, event.pubkey, "UPVOTE")}
              disabled={votingIds.has(event.id)}
              className={`p-1 rounded hover:bg-accent transition-colors ${
                userVote === "UPVOTE" ? "text-[var(--primary)]" : "text-gray-400"
              }`}
            >
              <ArrowBigUp size={18} fill={userVote === "UPVOTE" ? "currentColor" : "none"} />
            </button>
            
            <span className={`text-xs font-bold min-w-[20px] text-center ${
              userVote === "UPVOTE" ? "text-[var(--primary)]" : 
              userVote === "DOWNVOTE" ? "text-blue-600" : "text-gray-500"
            }`}>
              {score}
            </span>
            
            <button
              onClick={() => onVote(event.id, event.pubkey, "DOWNVOTE")}
              disabled={votingIds.has(event.id)}
              className={`p-1 rounded hover:bg-accent transition-colors ${
                userVote === "DOWNVOTE" ? "text-blue-600" : "text-gray-400"
              }`}
            >
              <ArrowBigDown size={18} fill={userVote === "DOWNVOTE" ? "currentColor" : "none"} />
            </button>
          </div>

          {/* Reply Button */}
          <button
            onClick={() => setIsReplying(!isReplying)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-[var(--primary)] transition-colors"
          >
            <MessageSquare size={14} />
            <span>Reply</span>
          </button>

          {/* Delete Button (only for owner) */}
          {isOwner && onDelete && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          )}
        </div>

        {/* Reply Input */}
        {isReplying && (
          <div className="mt-3 pl-8 space-y-2">
            <div className="flex items-start gap-2">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 bg-background border rounded-lg p-2 text-sm focus:ring-1 focus:ring-[var(--primary)] min-h-[80px] resize-y"
                autoFocus
              />
              <div className="relative group shrink-0">
                <button
                  type="button"
                  aria-label="Reply syntax help"
                  className="w-7 h-7 rounded-full bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                >
                  <HelpCircle size={14} />
                </button>
                <div className="pointer-events-none absolute right-0 top-9 z-10 w-64 rounded-lg border bg-card/95 p-3 text-xs text-muted-foreground shadow-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  Markdown works here too. Example: <code>**bold**</code>, <code>*italic*</code>,
                  <code> # heading</code>, <code>- list</code>.
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsReplying(false);
                  setReplyContent("");
                }}
                className="px-3 py-1.5 text-xs hover:bg-accent rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReplySubmit}
                disabled={!replyContent.trim()}
                className="px-3 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full text-xs font-bold hover:bg-[var(--primary-dark)] disabled:opacity-50"
              >
                Reply
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nested Replies */}
      {!isCollapsed && comment.replies.length > 0 && !isDeep && (
        <div className="mt-2 space-y-2">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.event.id}
              comment={reply}
              reactions={reactions}
              userVotes={userVotes}
              votingIds={votingIds}
              profiles={profiles}
              onVote={onVote}
              onReply={onReply}
              onDelete={onDelete}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {/* Deep thread indicator */}
      {!isCollapsed && comment.replies.length > 0 && isDeep && (
        <div className="mt-2 pl-4">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              // Could navigate to focused view
            }}
            className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1"
          >
            <CornerDownRight size={14} />
            Continue this thread →
          </a>
        </div>
      )}
    </div>
  );
}
