import { useState, useEffect } from "react";
import { useNostr } from "../providers/NostrProvider";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { X, Book, Edit2, Save, Eye } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";

interface CommunityWikiModalProps {
  community: NDKEvent;
  communityId: string;
  isOwner: boolean;
  isModerator: boolean;
  exit: () => void;
}

// Kind 30818 - Wiki article (NIP-51)
const WIKI_KIND = 30818;

export function CommunityWikiModal({ community, communityId, isOwner, isModerator, exit }: CommunityWikiModalProps) {
  const { ndk, user, requireSigner } = useNostr();
  const [wikiContent, setWikiContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const canEdit = isOwner || isModerator;

  useEffect(() => {
    fetchWiki();
  }, []);

  const fetchWiki = async () => {
    setIsLoading(true);
    try {
      const sub = ndk.subscribe(
        {
          kinds: [WIKI_KIND],
          authors: [community.pubkey],
          "#d": [`wiki:${communityId}`]
        },
        { closeOnEose: true }
      );

      let latestWiki: NDKEvent | null = null;

      sub.on("event", (event: NDKEvent) => {
        if (!latestWiki || (event.created_at || 0) > (latestWiki.created_at || 0)) {
          latestWiki = event;
        }
      });

      sub.on("eose", () => {
        if (latestWiki) {
          setWikiContent(latestWiki.content);
        }
        setIsLoading(false);
      });
    } catch (error) {
      console.error("Failed to fetch wiki", error);
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !canEdit) return;

    // Ensure signer is available for signing
    const hasSigner = await requireSigner();
    if (!hasSigner) {
      setError("Signing capability required. Please unlock with PIN.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const event = new NDKEvent(ndk);
      event.kind = WIKI_KIND;
      event.content = wikiContent;
      event.tags = [
        ["d", `wiki:${communityId}`],
        ["title", "Community Wiki"],
        ["a", `34550:${community.pubkey}:${communityId}`]
      ];

      await event.publish();
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save wiki", err);
      setError("Failed to save wiki. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border rounded-xl max-w-3xl w-full p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Book size={24} className="text-[var(--primary)]" />
            <h2 className="text-2xl font-black">Community Wiki</h2>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => isEditing ? setIsEditing(false) : setIsEditing(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                  isEditing
                    ? "bg-gray-600 text-white hover:bg-gray-700"
                    : "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-dark)]"
                }`}
              >
                {isEditing ? (
                  <>
                    <Eye size={16} />
                    <span>Preview</span>
                  </>
                ) : (
                  <>
                    <Edit2 size={16} />
                    <span>Edit</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={exit}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-gray-400">Loading wiki...</div>
        ) : isEditing ? (
          <div className="space-y-4">
            <textarea
              value={wikiContent}
              onChange={(e) => setWikiContent(e.target.value)}
              placeholder="Write your community wiki here... (Markdown supported)"
              className="w-full bg-accent/50 border rounded-lg p-4 focus:ring-1 focus:ring-[var(--primary)] min-h-[400px] resize-none font-mono text-sm"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="px-4 py-2 bg-accent/30 text-white rounded-lg hover:bg-accent/50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:bg-[var(--primary-dark)] transition-all disabled:opacity-50 font-bold"
              >
                <Save size={16} />
                {isSaving ? "Saving..." : "Save Wiki"}
              </button>
            </div>          </div>
        ) : wikiContent ? (
          <div className="[&_.prose]:max-w-none [&_.prose]:text-sm [&_.prose]:leading-relaxed">
            <MarkdownContent content={wikiContent} />
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <p>No wiki content yet.</p>
            {canEdit && (
              <button
                onClick={() => setIsEditing(true)}
                className="mt-4 px-6 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full font-bold hover:bg-[var(--primary-dark)] transition-all"
              >
                Create Wiki
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
