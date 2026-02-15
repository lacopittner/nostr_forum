import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useSavedPosts } from "../hooks/useSavedPosts";

interface SavePostButtonProps {
  post: NDKEvent;
  size?: "sm" | "md";
  disabled?: boolean;
}

export function SavePostButton({ post, size = "sm", disabled = false }: SavePostButtonProps) {
  const { isSaved, savePost, unsavePost } = useSavedPosts();
  const [isProcessing, setIsProcessing] = useState(false);
  
  const saved = isSaved(post.id);
  const iconSize = size === "sm" ? 16 : 20;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isProcessing || disabled) return;
    
    setIsProcessing(true);
    try {
      if (saved) {
        await unsavePost(post.id);
      } else {
        await savePost(post);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isProcessing || disabled}
      className={`flex items-center gap-1.5 transition-all ${
        disabled
          ? "text-muted-foreground opacity-40 cursor-not-allowed"
          : saved
            ? "text-[var(--primary)]"
            : "text-gray-400 hover:text-[var(--primary)]"
      } ${isProcessing ? "opacity-50" : ""}`}
      title={saved ? "Remove from saved" : "Save post"}
    >
      {saved ? (
        <BookmarkCheck size={iconSize} fill="currentColor" />
      ) : (
        <Bookmark size={iconSize} />
      )}
      <span className="text-xs font-bold">
        {saved ? "Saved" : "Save"}
      </span>
    </button>
  );
}
