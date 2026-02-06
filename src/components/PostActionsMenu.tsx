import { useState } from "react";
import { useNostr } from "../providers/NostrProvider";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { Pencil, Trash2, MoreHorizontal, X, Check, UserX } from "lucide-react";

interface PostActionsMenuProps {
  post: NDKEvent;
  onEdit?: (postId: string, newContent: string) => Promise<void> | void;
  onDelete?: (postId: string) => Promise<void> | void;
  onApprove?: (postId: string) => Promise<void> | void;
  onReject?: (postId: string) => Promise<void> | void;
  onBanUser?: (pubkey: string) => Promise<void> | void;
  moderationState?: "approved" | "rejected" | "pending";
  canModerate?: boolean;
  isComment?: boolean;
}

export function PostActionsMenu({
  post,
  onEdit,
  onDelete,
  onApprove,
  onReject,
  onBanUser,
  moderationState = "approved",
  canModerate = false,
  isComment = false,
}: PostActionsMenuProps) {
  const { user } = useNostr();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [isProcessing, setIsProcessing] = useState(false);

  const isOwner = user?.pubkey === post.pubkey;
  const canDelete = Boolean(onDelete && (isOwner || canModerate));
  const canEdit = Boolean(onEdit && isOwner);
  const canBan = Boolean(canModerate && onBanUser && user?.pubkey !== post.pubkey);
  const canApprove = Boolean(canModerate && onApprove);
  const canReject = Boolean(canModerate && onReject);

  if (!isOwner && !canModerate) return null;

  const handleEdit = async () => {
    if (!onEdit) return;
    if (!editContent.trim() || editContent === post.content) {
      setIsEditing(false);
      return;
    }

    setIsProcessing(true);
    try {
      await onEdit(post.id, editContent);
      setIsEditing(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || !onDelete) return;
    if (!confirm(`Are you sure you want to delete this ${isComment ? "comment" : "post"}?`)) {
      return;
    }

    setIsProcessing(true);
    try {
      await onDelete(post.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!onApprove) return;
    setIsProcessing(true);
    try {
      await onApprove(post.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!onReject) return;
    setIsProcessing(true);
    try {
      await onReject(post.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBan = async () => {
    if (!onBanUser) return;
    if (!confirm("Ban this user from the community?")) return;

    setIsProcessing(true);
    try {
      await onBanUser(post.pubkey);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-2">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full bg-background border rounded-lg p-2 text-sm focus:ring-1 focus:ring-[var(--primary)] min-h-[80px] resize-none"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setIsEditing(false);
              setEditContent(post.content);
            }}
            disabled={isProcessing}
            className="px-3 py-1.5 text-xs hover:bg-accent rounded-full transition-colors"
          >
            <X size={14} className="inline mr-1" />
            Cancel
          </button>
          <button
            onClick={handleEdit}
            disabled={isProcessing || !editContent.trim()}
            className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-full text-xs font-bold hover:bg-[var(--primary-dark)] disabled:opacity-50"
          >
            <Check size={14} className="inline mr-1" />
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        disabled={isProcessing}
        className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground disabled:opacity-50"
      >
        <MoreHorizontal size={16} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 w-32 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
            {canEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2"
              >
                <Pencil size={14} />
                Edit
              </button>
            )}

            {canDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors text-red-500 flex items-center gap-2"
              >
                <Trash2 size={14} />
                {canModerate && !isOwner ? "Remove" : "Delete"}
              </button>
            )}

            {(canApprove || canReject || canBan) && (
              <div className="border-t border-border/50 my-1" />
            )}

            {canApprove && moderationState !== "approved" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleApprove();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2"
              >
                <Check size={14} />
                Approve
              </button>
            )}

            {canReject && moderationState !== "rejected" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleReject();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2"
              >
                <X size={14} />
                Reject
              </button>
            )}

            {canBan && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleBan();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors text-red-500 flex items-center gap-2"
              >
                <UserX size={14} />
                Ban User
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
