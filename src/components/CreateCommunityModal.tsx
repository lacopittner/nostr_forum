import { useNostr } from "../providers/NostrProvider";
import { useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { X, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";

interface CreateCommunityModalProps {
  exit: () => void;
}

// Kind 30001 - Categorized People List for community membership
const COMMUNITY_LIST_KIND = 30001;

export function CreateCommunityModal({ exit }: CreateCommunityModalProps) {
  const { ndk, user } = useNostr();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [rules, setRules] = useState("");
  const [moderators, setModerators] = useState<string[]>([]);
  const [newModerator, setNewModerator] = useState("");
  const [flairs, setFlairs] = useState<string[]>([]);
  const [newFlair, setNewFlair] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState("");

  const handleCreateCommunity = async () => {
    if (!name.trim() || !user) {
      setError("Community name is required");
      return;
    }

    setIsPublishing(true);
    setError("");

    try {
      const communityId = nanoid();
      
      const event = new NDKEvent(ndk);
      event.kind = 34550; // NIP-72 Community
      event.content = description;
      
      // Build tags according to NIP-72
      const tags: string[][] = [
        ["d", communityId],
        ["name", name],
        ["description", description],
        ["image", image],
        ["rules", rules]
      ];
      
      // Add owner as first moderator (optional, owner is implicit)
      tags.push(["p", user.pubkey, "", "moderator"]);
      
      // Add flairs
      flairs.forEach(flair => {
        if (flair.trim()) {
          tags.push(["flair", flair.trim()]);
        }
      });
      
      // Add additional moderators
      moderators.forEach(mod => {
        if (mod.trim()) {
          tags.push(["p", mod.trim(), "", "moderator"]);
        }
      });
      
      event.tags = tags;

      await event.publish();
      
      // Auto-follow the community as owner
      const communityATag = `34550:${user.pubkey}:${communityId}`;
      
      // First, fetch existing community list
      const existingSub = ndk.subscribe(
        { kinds: [COMMUNITY_LIST_KIND], authors: [user.pubkey], "#d": ["communities"] },
        { closeOnEose: true }
      );
      
      let existingCommunities: string[] = [];
      
      existingSub.on("event", (e: NDKEvent) => {
        existingCommunities = e.tags
          .filter(t => t[0] === "a")
          .map(t => t[1])
          .filter(atag => atag.startsWith("34550:"));
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for subscription
      
      // Create updated community list
      const joinEvent = new NDKEvent(ndk);
      joinEvent.kind = COMMUNITY_LIST_KIND;
      joinEvent.content = "";
      joinEvent.tags = [
        ["d", "communities"],
        ...existingCommunities.map(atag => ["a", atag]),
        ["a", communityATag]
      ];
      
      await joinEvent.publish();
      console.log("Auto-joined community as owner");
      
      setIsPublishing(false);
      exit();
    } catch (err) {
      console.error("Failed to create community", err);
      setError("Failed to create community. Please try again.");
      setIsPublishing(false);
    }
  };

  const handleAddModerator = () => {
    if (newModerator.trim() && !moderators.includes(newModerator.trim())) {
      setModerators([...moderators, newModerator.trim()]);
      setNewModerator("");
    }
  };

  const handleRemoveModerator = (index: number) => {
    setModerators(moderators.filter((_, i) => i !== index));
  };

  const handleAddFlair = () => {
    if (newFlair.trim() && !flairs.includes(newFlair.trim())) {
      setFlairs([...flairs, newFlair.trim()]);
      setNewFlair("");
    }
  };

  const handleRemoveFlair = (index: number) => {
    setFlairs(flairs.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border rounded-xl max-w-lg w-full p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black">Create Community</h2>
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

        <div className="space-y-4">
          {/* Community Name */}
          <div>
            <label className="block text-sm font-semibold mb-2">Community Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Photography Tips"
              className="w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-orange-500 outline-none"
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
              placeholder="What is this community about?"
              className="w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-orange-500 outline-none min-h-[80px] resize-none"
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
              className="w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-orange-500 outline-none"
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
              placeholder="1. Be respectful&#10;2. No spam&#10;3. Stay on topic"
              className="w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-orange-500 outline-none min-h-[80px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-gray-400 mt-1">{rules.length}/500</p>
          </div>

          {/* Moderators */}
          <div>
            <label className="block text-sm font-semibold mb-2">Moderators</label>
            <p className="text-xs text-gray-400 mb-2">Add npub or pubkey of moderators (optional)</p>
            
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newModerator}
                onChange={(e) => setNewModerator(e.target.value)}
                placeholder="npub1... or pubkey"
                className="flex-1 bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-orange-500 outline-none text-sm"
              />
              <button
                onClick={handleAddModerator}
                disabled={!newModerator.trim()}
                className="px-4 py-2 bg-accent hover:bg-accent/70 rounded-lg transition-colors disabled:opacity-50"
              >
                <Plus size={20} />
              </button>
            </div>

            {/* Moderators List */}
            {moderators.length > 0 && (
              <div className="space-y-2">
                {moderators.map((mod, index) => (
                  <div key={index} className="flex items-center justify-between bg-accent/30 rounded-lg p-2">
                    <span className="text-sm font-mono truncate flex-1 mr-2">
                      {mod.slice(0, 20)}...{mod.slice(-8)}
                    </span>
                    <button
                      onClick={() => handleRemoveModerator(index)}
                      className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Flairs */}
          <div>
            <label className="block text-sm font-semibold mb-2">Flairs/Tags</label>
            <p className="text-xs text-gray-400 mb-2">Add flair options for posts (optional)</p>
            
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newFlair}
                onChange={(e) => setNewFlair(e.target.value)}
                placeholder="e.g., Discussion, Meme, News"
                className="flex-1 bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-orange-500 outline-none text-sm"
              />
              <button
                onClick={handleAddFlair}
                disabled={!newFlair.trim()}
                className="px-4 py-2 bg-accent hover:bg-accent/70 rounded-lg transition-colors disabled:opacity-50"
              >
                <Plus size={20} />
              </button>
            </div>

            {/* Flairs List */}
            {flairs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {flairs.map((flair, index) => (
                  <div key={index} className="flex items-center gap-1 bg-orange-600/10 border border-orange-600/20 rounded-full px-3 py-1">
                    <span className="text-sm text-orange-600">{flair}</span>
                    <button
                      onClick={() => handleRemoveFlair(index)}
                      className="p-0.5 text-orange-600/60 hover:text-orange-600 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
            onClick={handleCreateCommunity}
            disabled={isPublishing || !name.trim()}
            className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all disabled:opacity-50 font-bold"
          >
            {isPublishing ? "Creating..." : "Create Community"}
          </button>
        </div>
      </div>
    </div>
  );
}
