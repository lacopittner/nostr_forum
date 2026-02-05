import { useState } from "react";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";
import { useFollows } from "../hooks/useFollows";
import { useNostr } from "../providers/NostrProvider";
import { useToast } from "../lib/toast";

interface FollowButtonProps {
  pubkey: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
}

export function FollowButton({
  pubkey,
  size = "md",
  variant = "primary",
}: FollowButtonProps) {
  const { user } = useNostr();
  const { isFollowing, follow, unfollow } = useFollows();
  const { success, error: showError } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Don't show follow button for self
  if (user?.pubkey === pubkey) {
    return null;
  }

  const following = isFollowing(pubkey);

  const handleClick = async () => {
    if (!user) {
      showError("Please login to follow users");
      return;
    }

    setIsLoading(true);
    try {
      if (following) {
        const result = await unfollow(pubkey);
        if (result) {
          success("Unfollowed successfully");
        } else {
          showError("Failed to unfollow");
        }
      } else {
        const result = await follow(pubkey);
        if (result) {
          success("Following now!");
        } else {
          showError("Failed to follow");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sizeClasses = {
    sm: "px-3 py-1 text-xs",
    md: "px-4 py-1.5 text-sm",
    lg: "px-6 py-2 text-base",
  };

  const variantClasses = following
    ? "bg-muted text-muted-foreground hover:bg-accent"
    : variant === "primary"
    ? "bg-orange-600 text-white hover:bg-orange-700"
    : "bg-accent text-foreground hover:bg-accent/80";

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`flex items-center gap-2 rounded-full font-bold transition-all disabled:opacity-50 ${sizeClasses[size]} ${variantClasses}`}
    >
      {isLoading ? (
        <Loader2 size={size === "sm" ? 14 : 16} className="animate-spin" />
      ) : following ? (
        <>
          <UserCheck size={size === "sm" ? 14 : 16} />
          <span>Following</span>
        </>
      ) : (
        <>
          <UserPlus size={size === "sm" ? 14 : 16} />
          <span>Follow</span>
        </>
      )}
    </button>
  );
}
