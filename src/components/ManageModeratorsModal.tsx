import { useNostr } from "../providers/NostrProvider";
import { useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { X, Plus, Trash2 } from "lucide-react";

interface ManageModeratorsModalProps {
  community: NDKEvent;
  exit: () => void;
  onUpdate: () => void;
}

export function ManageModeratorsModal({ community, exit, onUpdate }: ManageModeratorsModalProps) {
  const { ndk, user } = useNostr();
  const [moderators, setModerators] = useState<string[]>(() => {
    // Extract existing moderators from community event
    return community.tags
      .filter(t => t[0] === "p" && t[3] === "moderator")
      .map(t => t[1]);
  });
  const [newModerator, setNewModerator] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isOwner = user && community.pubkey === user.pubkey;

  const handleAddModerator = () => {
    if (newModerator.trim() && !moderators.includes(newModerator.trim())) {
      setModerators([...moderators, newModerator.trim()]);
      setNewModerator("");
    }
  };

  const handleRemoveModerator = (pubkey: string) => {
    // Can't remove owner
    if (pubkey === community.pubkey) {
      setError("Cannot remove the community owner from moderators");
      return;
    }
    setModerators(moderators.filter(m => m !== pubkey));
  };

  const handleSave = async () => {
    if (!isOwner) {
      setError("Only the community owner can manage moderators");
      return;
    }

    setIsPublishing(true);
    setError("");
    setSuccess("");

    try {
      const updatedEvent = new NDKEvent(ndk);
      updatedEvent.kind = 34550;
      
      // Get d tag from original community
      const dTag = community.tags.find(t => t[0] === "d")?.[1] || "";
      const name = community.tags.find(t => t[0] === "name")?.[1] || "";
      const description = community.tags.find(t => t[0] === "description")?.[1] || "";
      const image = community.tags.find(t => t[0] === "image")?.[1] || "";
      const rules = community.tags.find(t => t[0] === "rules")?.[1] || "";
      
      // Build tags with updated moderators
      const tags: string[][] = [
        ["d", dTag],
        ["name", name],
        ["description", description],
        ["image", image],
        ["rules", rules]
      ];
      
      // Always include owner as moderator
      tags.push(["p", community.pubkey, "", "moderator"]);
      
      // Add other moderators
      moderators.forEach(mod => {
        if (mod !== community.pubkey && mod.trim()) {
          tags.push(["p", mod.trim(), "", "moderator"]);
        }
      });
      
      updatedEvent.tags = tags;
      updatedEvent.content = description;

      await updatedEvent.publish();
      setSuccess("Moderators updated successfully!");
      setIsPublishing(false);
      
      setTimeout(() => {
        onUpdate();
        exit();
      }, 1500);
    } catch (err) {
      console.error("Failed to update moderators", err);
      setError("Failed to update moderators. Please try again.");
      setIsPublishing(false);
    }
  };

  if (!isOwner) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-card border rounded-xl max-w-lg w-full p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-black">Manage Moderators</h2>
            <button
              onClick={exit}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-gray-400 mb-4">Only the community owner can manage moderators.</p>
          <button
            onClick={exit}
            className="w-full px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-dark)] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border rounded-xl max-w-lg w-full p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black">Manage Moderators</h2>
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
          <p className="text-sm text-gray-400">
            Add or remove moderators for this community. Moderators can help manage content but cannot delete the community.
          </p>

          {/* Add Moderator */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newModerator}
              onChange={(e) => setNewModerator(e.target.value)}
              placeholder="npub1... or pubkey"
              className="flex-1 bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none text-sm"
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
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-400">Current Moderators</h3>
            
            {moderators.length === 0 && (
              <p className="text-sm text-gray-500 italic">No moderators yet (owner only)</p>
            )}
            
            {moderators.map((mod) => (
              <div key={mod} className="flex items-center justify-between bg-accent/30 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-mono truncate block">
                    {mod.slice(0, 30)}...{mod.slice(-8)}
                  </span>
                  {mod === community.pubkey && (
                    <span className="text-[10px] text-[var(--primary)] font-bold">OWNER</span>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveModerator(mod)}
                  disabled={mod === community.pubkey}
                  className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={mod === community.pubkey ? "Cannot remove owner" : "Remove moderator"}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
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
            onClick={handleSave}
            disabled={isPublishing}
            className="flex-1 px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-dark)] transition-all disabled:opacity-50 font-bold"
          >
            {isPublishing ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
