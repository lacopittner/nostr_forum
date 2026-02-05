import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNostr } from "../providers/NostrProvider";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { ArrowLeft, Plus, Trash2, CheckCircle, AlertCircle, Server } from "lucide-react";

interface Relay {
  url: string;
  read: boolean;
  write: boolean;
}

export function RelayManagementPage() {
  const navigate = useNavigate();
  const { ndk, user } = useNostr();
  const [relays, setRelays] = useState<Relay[]>([]);
  const [newRelayUrl, setNewRelayUrl] = useState("");
  const [relayStatus, setRelayStatus] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [defaultRelays, setDefaultRelays] = useState<string[]>([]);

  useEffect(() => {
    // Always show default relays from NDK config
    const explicitRelays = ndk.explicitRelayUrls || [];
    setDefaultRelays(explicitRelays);
    
    // Check status of default relays
    explicitRelays.forEach((url) => {
      checkRelayStatus(url);
    });

    if (!user) return;

    // Fetch user's relay list (Kind 10002)
    ndk.subscribe(
      { kinds: [10002], authors: [user.pubkey] },
      { closeOnEose: true }
    ).on("event", (event: NDKEvent) => {
      const relayData = event.tags
        .filter((t) => t[0] === "r")
        .map((t) => ({
          url: t[1],
          read: !t[2] || t[2].includes("read"),
          write: !t[2] || t[2].includes("write"),
        }));
      setRelays(relayData);

      // Check relay status
      relayData.forEach((relay) => {
        checkRelayStatus(relay.url);
      });
    });
  }, [user, ndk]);

  const checkRelayStatus = async (url: string) => {
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        setRelayStatus((prev) => ({ ...prev, [url]: true }));
        ws.close();
      };
      ws.onerror = () => {
        setRelayStatus((prev) => ({ ...prev, [url]: false }));
      };
      setTimeout(() => ws.close(), 5000);
    } catch (e) {
      setRelayStatus((prev) => ({ ...prev, [url]: false }));
    }
  };

  const handleAddRelay = async () => {
    if (!newRelayUrl.trim() || !user || !ndk) return;

    // Validate URL
    try {
      new URL(newRelayUrl);
    } catch {
      alert("Invalid relay URL");
      return;
    }

    // Add to list
    const updatedRelays = [
      ...relays,
      {
        url: newRelayUrl,
        read: true,
        write: true,
      },
    ];

    await saveRelays(updatedRelays);
    setNewRelayUrl("");
  };

  const handleRemoveRelay = async (url: string) => {
    const updatedRelays = relays.filter((r) => r.url !== url);
    await saveRelays(updatedRelays);
  };

  const toggleRelay = async (url: string, type: "read" | "write") => {
    const updatedRelays = relays.map((r) =>
      r.url === url
        ? { ...r, [type]: !r[type] }
        : r
    );
    await saveRelays(updatedRelays);
  };

  const saveRelays = async (updatedRelays: Relay[]) => {
    if (!user || !ndk) return;

    setIsSaving(true);
    try {
      const event = new NDKEvent(ndk);
      event.kind = 10002;
      event.tags = updatedRelays.map((r) => {
        const readWrite = [];
        if (r.read) readWrite.push("read");
        if (r.write) readWrite.push("write");
        return ["r", r.url, readWrite.join(",")];
      });

      await event.publish();
      setRelays(updatedRelays);
      console.log("Relays saved to Kind 10002");
    } catch (error) {
      console.error("Failed to save relays", error);
      alert("Failed to save relays");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-bold"
      >
        <ArrowLeft size={20} />
        Back
      </button>

      <div>
        <h1 className="text-2xl font-black text-foreground">Relay Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your Nostr relays (NIP-65)
        </p>
      </div>

      {/* Default Relays - Always visible */}
      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Server size={20} className="text-orange-600" />
          <h2 className="font-bold">Connected Relays</h2>
        </div>
        <div className="space-y-2">
          {defaultRelays.length === 0 ? (
            <div className="text-muted-foreground text-sm">No default relays configured.</div>
          ) : (
            defaultRelays.map((url) => (
              <div
                key={url}
                className="flex items-center gap-2 p-3 bg-accent/30 rounded-lg"
              >
                {relayStatus[url] ? (
                  <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
                ) : (
                  <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
                )}
                <span className="font-mono text-sm truncate">{url}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {relayStatus[url] ? "Connected" : "Disconnected"}
                </span>
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          These relays are configured in your app settings and cannot be removed from here.
        </p>
      </div>

      {/* Add New Relay */}
      {user && (
        <div className="bg-card border rounded-xl p-4 shadow-sm">
          <h2 className="font-bold mb-3">Add Relay to Your List</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              placeholder="wss://relay.example.com"
              className="flex-1 bg-accent/50 border-none rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500"
            />
            <button
              onClick={handleAddRelay}
              disabled={isSaving || !newRelayUrl.trim()}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg font-bold text-sm hover:bg-orange-700 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>
      )}

      {/* Relays List */}
      {user && (
        <div>
          <h2 className="font-bold mb-3">Your Saved Relays ({relays.length})</h2>
          {relays.length === 0 ? (
            <div className="bg-card border rounded-xl p-6 text-center text-muted-foreground">
              No relays saved to your profile. Add one to get started!
            </div>
          ) : (
            <div className="space-y-2">
              {relays.map((relay) => (
                <div
                  key={relay.url}
                  className="bg-card border rounded-xl p-4 shadow-sm flex items-center justify-between hover:border-orange-500/20 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {relayStatus[relay.url] ? (
                        <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
                      ) : (
                        <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
                      )}
                      <a
                        href={relay.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground font-mono text-sm hover:text-orange-600 truncate"
                      >
                        {relay.url}
                      </a>
                    </div>

                    {/* Read/Write Toggles */}
                    <div className="flex gap-3 ml-6">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={relay.read}
                          onChange={() => toggleRelay(relay.url, "read")}
                          className="rounded"
                        />
                        <span className="text-muted-foreground">Read</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={relay.write}
                          onChange={() => toggleRelay(relay.url, "write")}
                          className="rounded"
                        />
                        <span className="text-muted-foreground">Write</span>
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveRelay(relay.url)}
                    disabled={isSaving}
                    className="p-2 text-red-600 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50 flex-shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!user && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <h3 className="font-bold text-blue-600 mb-2">Sign in to manage relays</h3>
          <p className="text-sm text-blue-600/80">
            Connect your Nostr extension to save your relay preferences to your profile.
          </p>
        </div>
      )}
    </div>
  );
}
