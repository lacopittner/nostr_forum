import { useState } from "react";
import { useNostr } from "../providers/NostrProvider";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { Pencil, Trash2, MoreHorizontal, X, Check } from "lucide-react";

interface PostActionsMenuProps {
  post: NDKEvent;
  onEdit?: (postId: string, newContent: string) => void;
  onDelete?: (postId: string) => void;
  isComment?: boolean;
}

export function PostActionsMenu({ post, onEdit, onDelete, isComment = false }: PostActionsMenuProps) {
  const { user } = useNostr();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [isProcessing, setIsProcessing] = useState(false);

  const isOwner = user?.pubkey === post.pubkey;

  if (!isOwner) return null;

  const handleEdit = async () => {
    if (!editContent.trim() || editContent === post.content) {
      setIsEditing(false);
      return;
    }

    setIsProcessing(true);
    try {
      await onEdit?.(post.id, editContent);
      setIsEditing(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete this ${isComment ? "comment" : "post"}?`)) {
      return;
    }

    setIsProcessing(true);
    try {
      await onDelete?.(post.id);
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
          className="w-full bg-background border rounded-lg p-2 text-sm focus:ring-1 focus:ring-orange-500 min-h-[80px] resize-none"
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
            className="px-3 py-1.5 bg-orange-600 text-white rounded-full text-xs font-bold hover:bg-orange-700 disabled:opacity-50"
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors text-red-500 flex items-center gap-2"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
