import { useState } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { Send, Loader2, AlertCircle, Image as ImageIcon, X } from "lucide-react";
import { useNostr } from "../providers/NostrProvider";
import { useToast } from "../lib/toast";
import { useRateLimit } from "../hooks/useRateLimit";
import { logger } from "../lib/logger";
import { FlairSelector } from "./FlairSelector";
import { ImageUpload } from "./ImageUpload";

interface CreatePostProps {
  community?: {
    pubkey: string;
    id: string;
    name: string;
    atag: string;
    flairs?: string[];
  };
  communities?: Array<{
    id: string;
    pubkey: string;
    name: string;
    atag: string;
    flairs?: string[];
  }>;
  onPostCreated?: () => void;
}

export function CreatePost({ community, communities, onPostCreated }: CreatePostProps) {
  const { ndk, user } = useNostr();
  const { success, error: showError } = useToast();
  const [content, setContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [selectedCommunityAtag, setSelectedCommunityAtag] = useState<string>(
    community?.atag || ""
  );
  const [selectedFlair, setSelectedFlair] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [showImageUpload, setShowImageUpload] = useState(false);

  const { checkRateLimit } = useRateLimit("posting", {
    maxAttempts: 3,
    windowMs: 60000,
    cooldownMs: 30000,
  });

  const isInCommunityPage = !!community;
  const selectedCommunity = isInCommunityPage
    ? community
    : communities?.find((c) => c.atag === selectedCommunityAtag);

  const availableFlairs = selectedCommunity?.flairs || [];

  const handleImageUploaded = (url: string) => {
    setImageUrls((prev) => [...prev, url]);
    setShowImageUpload(false);
  };

  const handleRemoveImage = (index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePublish = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || !user || isPublishing) return;

    if (!selectedCommunity) {
      setPostError("Select a community to post.");
      showError("Select a community to post.");
      return;
    }

    if (!checkRateLimit()) return;

    setIsPublishing(true);
    setPostError(null);

    try {
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;

      // Build content with images
      let finalContent = trimmedContent;
      if (imageUrls.length > 0) {
        finalContent += "\n\n" + imageUrls.join("\n");
      }
      event.content = finalContent;

      // Build tags
      const tags: string[][] = [];

      tags.push([
        "a",
        selectedCommunity.atag,
        selectedCommunity.pubkey,
        "root",
      ]);
      tags.push(["t", selectedCommunity.name.toLowerCase()]);

      // Add flair if selected
      if (selectedFlair) {
        tags.push(["flair", selectedFlair]);
      }

      event.tags = tags;
      await event.publish();

      // Reset form
      setContent("");
      setSelectedFlair(null);
      setImageUrls([]);
      setShowImageUpload(false);

      success("Post published successfully!");
      onPostCreated?.();
    } catch (error) {
      logger.error("Failed to publish post:", error);
      setPostError("Failed to publish post. Check your relay connection.");
      showError("Failed to publish post. Check your relay connection.");
    } finally {
      setIsPublishing(false);
    }
  };

  const placeholder = isInCommunityPage
    ? "Share something with this community..."
    : "What's on your mind?";

  const buttonText = isPublishing
    ? "Posting..."
    : isInCommunityPage
    ? "Post"
    : "Post to Community";

  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm">
      {postError && (
        <div className="mb-3 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle size={16} />
          <span>{postError}</span>
        </div>
      )}

      {/* Community selector - only shown on homepage */}
      {!isInCommunityPage && (
        <div className="mb-3">
          <label className="block text-xs font-bold text-muted-foreground mb-1">
            Community
          </label>
          <select
            value={selectedCommunityAtag}
            onChange={(e) => {
              setSelectedCommunityAtag(e.target.value);
              setSelectedFlair(null); // Reset flair when changing community
              setPostError(null);
            }}
            disabled={!communities || communities.length === 0}
            className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-[var(--primary)] disabled:opacity-50"
          >
            <option value="">Select a community</option>
            {communities?.map((c) => (
              <option key={c.atag} value={c.atag}>
                {c.name}
              </option>
            ))}
          </select>
          {(!communities || communities.length === 0) && (
            <p className="mt-1 text-xs text-muted-foreground">
              Join a community to post.
            </p>
          )}
        </div>
      )}

      {/* Text area */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-accent/50 border-none rounded-lg p-3 text-sm focus:ring-1 focus:ring-[var(--primary)] min-h-[100px] resize-none overflow-hidden"
      />

      {/* Image previews */}
      {imageUrls.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {imageUrls.map((url, idx) => (
            <div key={idx} className="relative group">
              <img
                src={url}
                alt={`Upload ${idx + 1}`}
                className="h-24 w-24 object-cover rounded-lg border border-border"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/%3E%3C/svg%3E";
                }}
              />
              <button
                onClick={() => handleRemoveImage(idx)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                type="button"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Image upload */}
      {showImageUpload && (
        <div className="mt-3">
          <ImageUpload
            onImageUploaded={handleImageUploaded}
            onCancel={() => setShowImageUpload(false)}
          />
        </div>
      )}

      {/* Action bar */}
      <div className="mt-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          {/* Image toggle button */}
          <button
            onClick={() => setShowImageUpload(!showImageUpload)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${
              showImageUpload
                ? "bg-[var(--primary)] text-white"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <ImageIcon size={16} />
            <span>Image</span>
          </button>

          {/* Flair selector - shown when community has flairs */}
          <FlairSelector
            flairs={availableFlairs}
            selectedFlair={selectedFlair}
            onSelect={setSelectedFlair}
            compact
          />
        </div>

        <button
          onClick={handlePublish}
          disabled={
            isPublishing ||
            !content.trim() ||
            (!isInCommunityPage && !selectedCommunityAtag)
          }
          className="flex items-center space-x-2 px-6 py-2 bg-[var(--primary)] text-white rounded-full font-bold text-sm hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-all"
        >
          {isPublishing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
          <span>{buttonText}</span>
        </button>
      </div>
    </div>
  );
}
