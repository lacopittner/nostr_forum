import { useNostr } from "../providers/NostrProvider";
import { useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { X } from "lucide-react";

interface EditCommunityModalProps {
  community: NDKEvent;
  exit: () => void;
}

export function EditCommunityModal({ community, exit }: EditCommunityModalProps) {
  const { ndk, user } = useNostr();
  const [name, setName] = useState(community.tags.find(t => t[0] === "name")?.[1] || "");
  const [description, setDescription] = useState(community.tags.find(t => t[0] === "description")?.[1] || "");
  const [image, setImage] = useState(community.tags.find(t => t[0] === "image")?.[1] || "");
  const [rules, setRules] = useState(community.tags.find(t => t[0] === "rules")?.[1] || "");
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Only owner can edit
  const isOwner = user && community.pubkey === user.pubkey;

  const handleUpdateCommunity = async () => {
    if (!name.trim() || !isOwner) {
      setError("Not authorized to edit this community");
      return;
    }

    setIsPublishing(true);
    setError("");
    setSuccess("");

    try {
      const updatedEvent = new NDKEvent(ndk);
      updatedEvent.kind = 34550;
      updatedEvent.content = description;
      
      // Get d tag from original community
      const dTag = community.tags.find(t => t[0] === "d")?.[1] || "";
      
      updatedEvent.tags = [
        ["d", dTag],
        ["name", name],
        ["description", description],
        ["image", image],
        ["rules", rules]
      ];

      await updatedEvent.publish();
      setSuccess("Community updated successfully!");
      setIsPublishing(false);
      
      setTimeout(() => {
        exit();
      }, 1500);
    } catch (err) {
      console.error("Failed to update community", err);
      setError("Failed to update community. Please try again.");
      setIsPublishing(false);
    }
  };

  if (!isOwner) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-card border rounded-xl max-w-lg w-full p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-black">Edit Community</h2>
            <button
              onClick={exit}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-gray-400 mb-4">Only the community owner can edit community settings.</p>
          <button
            onClick={exit}
            className="w-full px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:bg-[var(--primary-dark)] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border rounded-xl max-w-lg w-full p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black">Edit Community</h2>
          <button
            onClick={exit}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
            {success}
          </div>
        )}

        <div className="space-y-4">
          {/* Community Name */}
          <div>
            <label className="block text-sm font-semibold mb-2">Community Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Community name"
              className="w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none"
              maxLength={100}
            />
            <p className="text-xs text-gray-400 mt-1">{name.length}/100</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Community description"
              className="w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none min-h-[80px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-gray-400 mt-1">{description.length}/500</p>
          </div>

          {/* Community Image */}
          <div>
            <label className="block text-sm font-semibold mb-2">Community Image URL</label>
            <input
              type="url"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none"
            />
            {image && (
              <img
                src={image}
                alt="Preview"
                className="mt-3 w-full h-32 object-cover rounded-lg"
                onError={() => setImage("")}
              />
            )}
          </div>

          {/* Rules */}
          <div>
            <label className="block text-sm font-semibold mb-2">Community Rules</label>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="Community rules"
              className="w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none min-h-[80px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-gray-400 mt-1">{rules.length}/500</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={exit}
            disabled={isPublishing}
            className="flex-1 px-4 py-2 bg-accent/30 text-white rounded-lg hover:bg-accent/50 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpdateCommunity}
            disabled={isPublishing || !name.trim()}
            className="flex-1 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:bg-[var(--primary-dark)] transition-all disabled:opacity-50 font-bold"
          >
            {isPublishing ? "Updating..." : "Update Community"}
          </button>
        </div>
      </div>
    </div>
  );
}
