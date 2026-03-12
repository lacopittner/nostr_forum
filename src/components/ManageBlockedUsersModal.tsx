import { useNostr } from "../providers/NostrProvider";
import { useState, useEffect } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { X, Trash2, Shield } from "lucide-react";

interface ManageBlockedUsersModalProps {
  community: NDKEvent;
  exit: () => void;
}

// Kind 34551 - Custom for community user blocks
const COMMUNITY_BLOCK_KIND = 34551 as any;

export function ManageBlockedUsersModal({ community, exit }: ManageBlockedUsersModalProps) {
  const { ndk, user, requireSigner } = useNostr();
  const [blockedUsers, setBlockedUsers] = useState<Array<{ pubkey: string; reason: string; blocked_at: number }>>([]);
  const [newBlockedUser, setNewBlockedUser] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState("");

  // Check if user is owner or moderator
  const isModerator = user ? (
    community.pubkey === user.pubkey ||
    community.tags.some(t => t[0] === "p" && t[1] === user.pubkey && t[3] === "moderator")
  ) : false;

  // Get community identifier
  const communityD = community.tags.find(t => t[0] === "d")?.[1] || "";
  const communityId = `34550:${community.pubkey}:${communityD}`;

  useEffect(() => {
    fetchBlockedUsers();
  }, []);

  const fetchBlockedUsers = async () => {
    setIsLoading(true);
    try {
      const authorizedModerators = new Set<string>([
        community.pubkey,
        ...community.tags
          .filter(t => t[0] === "p" && t[3] === "moderator")
          .map(t => t[1]),
      ]);

      // Subscribe to block events for this community
      const sub = ndk.subscribe(
        {
          kinds: [COMMUNITY_BLOCK_KIND],
          "#a": [communityId],
          limit: 500,
        },
        { closeOnEose: true }
      );

      const blocks: Array<{ pubkey: string; reason: string; blocked_at: number; type: string }> = [];
      
      sub.on("event", (event: NDKEvent) => {
        if (!authorizedModerators.has(event.pubkey)) return;
        const blockedPubkey = event.tags.find(t => t[0] === "p")?.[1];
        if (blockedPubkey) {
          blocks.push({
            pubkey: blockedPubkey,
            reason: event.content || "No reason given",
            blocked_at: event.created_at || 0,
            type: (event.tags.find(t => t[0] === "e")?.[1] || "block").toLowerCase(),
          });
        }
      });

      sub.on("eose", () => {
        // Remove duplicates (keep latest action) and keep only active blocks.
        const latestBlocks = new Map<string, { pubkey: string; reason: string; blocked_at: number; type: string }>();
        blocks.forEach(block => {
          const existing = latestBlocks.get(block.pubkey);
          if (!existing || block.blocked_at > existing.blocked_at) {
            latestBlocks.set(block.pubkey, block);
          }
        });

        setBlockedUsers(
          Array.from(latestBlocks.values())
            .filter(block => block.type === "block")
            .map(({ pubkey, reason, blocked_at }) => ({ pubkey, reason, blocked_at }))
        );
        setIsLoading(false);
      });
    } catch (error) {
      console.error("Failed to fetch blocked users", error);
      setIsLoading(false);
    }
  };

  const handleBlockUser = async () => {
    if (!newBlockedUser.trim() || !isModerator || !user) {
      setError("Cannot block user");
      return;
    }

    setIsPublishing(true);
    setError("");

    // Ensure signer is available for signing
    const hasSigner = await requireSigner();
    if (!hasSigner) {
      setError("Signing capability required. Please unlock with PIN.");
      setIsPublishing(false);
      return;
    }

    try {
      const blockEvent = new NDKEvent(ndk);
      blockEvent.kind = 34551 as any;
      blockEvent.content = blockReason.trim() || "Blocked by moderator";
      blockEvent.tags = [
        ["a", communityId],
        ["p", newBlockedUser.trim()],
        ["e", "block"]
      ];

      await blockEvent.publish();
      
      // Refresh list
      setNewBlockedUser("");
      setBlockReason("");
      await fetchBlockedUsers();
      setIsPublishing(false);
    } catch (err) {
      console.error("Failed to block user", err);
      setError("Failed to block user. Please try again.");
      setIsPublishing(false);
    }
  };

  const handleUnblockUser = async (pubkey: string) => {
    if (!isModerator || !user) return;

    // Ensure signer is available for signing
    const hasSigner = await requireSigner();
    if (!hasSigner) {
      setError("Signing capability required. Please unlock with PIN.");
      return;
    }

    setIsPublishing(true);
    try {
      // Create unblock event (kind 5 - deletion) or new block event with "unblock"
      const unblockEvent = new NDKEvent(ndk);
      unblockEvent.kind = 34551 as any;
      unblockEvent.content = "User unblocked";
      unblockEvent.tags = [
        ["a", communityId],
        ["p", pubkey],
        ["e", "unblock"]
      ];

      await unblockEvent.publish();
      
      // Remove from local list
      setBlockedUsers(blockedUsers.filter(u => u.pubkey !== pubkey));
      setIsPublishing(false);
    } catch (err) {
      console.error("Failed to unblock user", err);
      setError("Failed to unblock user");
      setIsPublishing(false);
    }
  };

  if (!isModerator) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-card border rounded-xl max-w-lg w-full p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-black">Manage Blocked Users</h2>
            <button
              onClick={exit}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-gray-400 mb-4">Only moderators can manage blocked users.</p>
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
      <div className="bg-card border rounded-xl max-w-lg w-full p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield size={24} className="text-[var(--primary)]" />
            <h2 className="text-2xl font-black">Manage Blocked Users</h2>
          </div>
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
          <p className="text-sm text-gray-400">
            Blocked users cannot create posts in this community. They can still view content.
          </p>

          {/* Add Blocked User */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold">Block New User</label>
            <input
              type="text"
              value={newBlockedUser}
              onChange={(e) => setNewBlockedUser(e.target.value)}
              placeholder="npub1... or pubkey"
              className="w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none text-sm"
            />
            <input
              type="text"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Reason for blocking (optional)"
              className="w-full bg-accent/50 border rounded-lg p-3 focus:ring-1 focus:ring-[var(--primary)] outline-none text-sm"
            />
            <button
              onClick={handleBlockUser}
              disabled={isPublishing || !newBlockedUser.trim()}
              className="w-full px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-all disabled:opacity-50 font-bold"
            >
              {isPublishing ? "Blocking..." : "Block User"}
            </button>
          </div>

          {/* Blocked Users List */}
          <div className="space-y-2 pt-4 border-t">
            <h3 className="text-sm font-semibold text-gray-400">Blocked Users ({blockedUsers.length})</h3>
            
            {isLoading && <p className="text-sm text-gray-500">Loading...</p>}
            
            {!isLoading && blockedUsers.length === 0 && (
              <p className="text-sm text-gray-500 italic">No blocked users</p>
            )}
            
            {!isLoading && blockedUsers.map((user) => (
              <div key={user.pubkey} className="flex items-center justify-between bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-mono truncate block">
                    {user.pubkey.slice(0, 25)}...{user.pubkey.slice(-8)}
                  </span>
                  {user.reason && (
                    <span className="text-xs text-gray-500">Reason: {user.reason}</span>
                  )}
                  <span className="text-[10px] text-gray-500 block">
                    Blocked: {new Date(user.blocked_at * 1000).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={() => handleUnblockUser(user.pubkey)}
                  disabled={isPublishing}
                  className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-md transition-colors disabled:opacity-50"
                  title="Unblock user"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6">
          <button
            onClick={exit}
            className="w-full px-4 py-2 bg-accent/30 text-white rounded-lg hover:bg-accent/50 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
