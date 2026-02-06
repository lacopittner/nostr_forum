import { useNostr } from "../providers/NostrProvider";
import { useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { X, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { communitySchema, type CommunityFormData } from "../lib/validation";

interface CreateCommunityModalProps {
  exit: () => void;
}

// Kind 30001 - Categorized People List for community membership
const COMMUNITY_LIST_KIND = 30001;

export function CreateCommunityModal({ exit }: CreateCommunityModalProps) {
  const { ndk, user } = useNostr();
  const [moderators, setModerators] = useState<string[]>([]);
  const [newModerator, setNewModerator] = useState("");
  const [flairs, setFlairs] = useState<string[]>([]);
  const [newFlair, setNewFlair] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CommunityFormData>({
    resolver: zodResolver(communitySchema),
    defaultValues: {
      name: "",
      description: "",
      image: "",
      rules: "",
    },
  });

  const watchedName = watch("name");
  const watchedDescription = watch("description");
  const watchedRules = watch("rules");

  const onSubmit = async (data: CommunityFormData) => {
    if (!user) return;

    setIsPublishing(true);

    try {
      const communityId = nanoid();
      
      const event = new NDKEvent(ndk);
      event.kind = 34550; // NIP-72 Community
      event.content = data.description || "";
      
      // Build tags according to NIP-72
      const tags: string[][] = [
        ["d", communityId],
        ["name", data.name],
        ["description", data.description || ""],
        ["image", data.image || ""],
        ["rules", data.rules || ""]
      ];
      
      // Add owner as first moderator
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
      
      // Fetch latest existing community list event (if present)
      const existingEvents = await ndk.fetchEvents(
        { kinds: [COMMUNITY_LIST_KIND], authors: [user.pubkey], "#d": ["communities"] },
        { closeOnEose: true }
      );

      const latestListEvent = Array.from(existingEvents).sort(
        (a, b) => (b.created_at || 0) - (a.created_at || 0)
      )[0];

      const existingCommunities = latestListEvent
        ? latestListEvent.tags
            .filter(t => t[0] === "a")
            .map(t => t[1])
            .filter(atag => atag.startsWith("34550:"))
        : [];

      const mergedCommunities = Array.from(
        new Set([...existingCommunities, communityATag])
      );
      
      // Create updated community list
      const joinEvent = new NDKEvent(ndk);
      joinEvent.kind = COMMUNITY_LIST_KIND;
      joinEvent.content = "";
      joinEvent.tags = [
        ["d", "communities"],
        ...mergedCommunities.map(atag => ["a", atag])
      ];
      
      await joinEvent.publish();
      console.log("Auto-joined community as owner");
      
      setIsPublishing(false);
      exit();
    } catch (err) {
      console.error("Failed to create community", err);
      setIsPublishing(false);
    }
  };

  const handleAddModerator = () => {
    if (newModerator.trim() && !moderators.includes(newModerator.trim())) {
      // Basic validation for pubkey format
      const isValid = newModerator.match(/^(npub1|nsec1|[a-f0-9]{64})$/);
      if (!isValid) {
        alert("Invalid pubkey format");
        return;
      }
      setModerators([...moderators, newModerator.trim()]);
      setNewModerator("");
    }
  };

  const handleRemoveModerator = (index: number) => {
    setModerators(moderators.filter((_, i) => i !== index));
  };

  const handleAddFlair = () => {
    if (newFlair.trim() && !flairs.includes(newFlair.trim()) && flairs.length < 10) {
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
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black">Create Community</h2>
            <button
              type="button"
              onClick={exit}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Community Name */}
            <div>
              <label className="block text-sm font-semibold mb-2">Community Name *</label>
              <input
                type="text"
                {...register("name")}
                placeholder="e.g., Photography Tips"
                className={`w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none ${
                  errors.name ? "border-red-500" : ""
                }`}
                maxLength={100}
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-400">{watchedName?.length || 0}/100</span>
                {errors.name && (
                  <span className="text-xs text-red-400">{errors.name.message}</span>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold mb-2">Description</label>
              <textarea
                {...register("description")}
                placeholder="What is this community about?"
                className={`w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none min-h-[80px] resize-none ${
                  errors.description ? "border-red-500" : ""
                }`}
                maxLength={500}
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-400">{watchedDescription?.length || 0}/500</span>
                {errors.description && (
                  <span className="text-xs text-red-400">{errors.description.message}</span>
                )}
              </div>
            </div>

            {/* Community Image */}
            <div>
              <label className="block text-sm font-semibold mb-2">Community Image URL</label>
              <input
                type="url"
                {...register("image")}
                placeholder="https://example.com/image.jpg"
                className={`w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none ${
                  errors.image ? "border-red-500" : ""
                }`}
              />
              {errors.image && (
                <p className="text-xs text-red-400 mt-1">{errors.image.message}</p>
              )}
              {watch("image") && !errors.image && (
                <img
                  src={watch("image")}
                  alt="Preview"
                  className="mt-3 w-full h-32 object-cover rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
            </div>

            {/* Rules */}
            <div>
              <label className="block text-sm font-semibold mb-2">Community Rules</label>
              <textarea
                {...register("rules")}
                placeholder="1. Be respectful&#10;2. No spam&#10;3. Stay on topic"
                className={`w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none min-h-[80px] resize-none ${
                  errors.rules ? "border-red-500" : ""
                }`}
                maxLength={500}
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-400">{watchedRules?.length || 0}/500</span>
                {errors.rules && (
                  <span className="text-xs text-red-400">{errors.rules.message}</span>
                )}
              </div>
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
                  className="flex-1 bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none text-sm"
                />
                <button
                  type="button"
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
                        type="button"
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
              <label className="block text-sm font-semibold mb-2">Flairs/Tags ({flairs.length}/10)</label>
              <p className="text-xs text-gray-400 mb-2">Add flair options for posts (optional)</p>
              
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newFlair}
                  onChange={(e) => setNewFlair(e.target.value)}
                  placeholder="e.g., Discussion, Meme, News"
                  className="flex-1 bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none text-sm"
                  maxLength={30}
                />
                <button
                  type="button"
                  onClick={handleAddFlair}
                  disabled={!newFlair.trim() || flairs.length >= 10}
                  className="px-4 py-2 bg-accent hover:bg-accent/70 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Plus size={20} />
                </button>
              </div>

              {/* Flairs List */}
              {flairs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {flairs.map((flair, index) => (
                    <div key={index} className="flex items-center gap-1 bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-full px-3 py-1">
                      <span className="text-sm text-[var(--primary)]">{flair}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFlair(index)}
                        className="p-0.5 text-[var(--primary)]/60 hover:text-[var(--primary)] transition-colors"
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
              type="button"
              onClick={exit}
              disabled={isPublishing}
              className="flex-1 px-4 py-2 bg-accent/30 text-white rounded-lg hover:bg-accent/50 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPublishing}
              className="flex-1 px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-dark)] transition-all disabled:opacity-50 font-bold"
            >
              {isPublishing ? "Creating..." : "Create Community"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
