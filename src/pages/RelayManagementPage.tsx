import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNostr } from "../providers/NostrProvider";
import { ArrowLeft, Plus, Trash2, CheckCircle, AlertCircle, Server, RefreshCw } from "lucide-react";
import { getStoredRelays, saveStoredRelays } from "../lib/ndk";

interface RelayStatus {
  url: string;
  connected: boolean;
  checked: boolean;
}

export function RelayManagementPage() {
  const navigate = useNavigate();
  const { ndk: ndkInstance } = useNostr();
  const [relays, setRelays] = useState<RelayStatus[]>([]);
  const [newRelayUrl, setNewRelayUrl] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  // Load relays from localStorage on mount
  useEffect(() => {
    const storedRelays = getStoredRelays();
    setRelays(storedRelays.map(url => ({ url, connected: false, checked: false })));
    
    // Check status of each relay
    storedRelays.forEach(checkRelayStatus);
  }, []);

  const checkRelayStatus = async (url: string) => {
    setRelays(prev => prev.map(r => 
      r.url === url ? { ...r, checked: false } : r
    ));

    try {
      const ws = new WebSocket(url);
      
      const timeout = setTimeout(() => {
        ws.close();
        setRelays(prev => prev.map(r => 
          r.url === url ? { ...r, connected: false, checked: true } : r
        ));
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        setRelays(prev => prev.map(r => 
          r.url === url ? { ...r, connected: true, checked: true } : r
        ));
        ws.close();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        setRelays(prev => prev.map(r => 
          r.url === url ? { ...r, connected: false, checked: true } : r
        ));
      };
    } catch {
      setRelays(prev => prev.map(r => 
        r.url === url ? { ...r, connected: false, checked: true } : r
      ));
    }
  };

  const checkAllRelays = () => {
    relays.forEach(r => checkRelayStatus(r.url));
  };

  const reconnectWithRelays = async (relayUrls: string[]) => {
    if (relayUrls.length === 0) {
      ndkInstance.pool.relays.forEach((relay: any) => {
        relay.disconnect();
      });
      (ndkInstance as any).explicitRelayUrls = [];
      return;
    }

    setIsConnecting(true);

    try {
      ndkInstance.pool.relays.forEach((relay: any) => {
        relay.disconnect();
      });

      (ndkInstance as any).explicitRelayUrls = relayUrls;
      await ndkInstance.connect();
    } catch {
      // UI status is updated by explicit relay checks below
    } finally {
      setIsConnecting(false);
      relayUrls.forEach(checkRelayStatus);
    }
  };

  const handleAddRelay = () => {
    if (!newRelayUrl.trim()) return;

    // Validate URL format
    let url = newRelayUrl.trim();
    
    // Add wss:// or ws:// if missing
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      url = "wss://" + url;
    }

    // Check if already exists
    if (relays.some(r => r.url === url)) {
      alert("This relay is already in your list");
      return;
    }

    // Add to list
    const updatedRelays = [...relays, { url, connected: false, checked: false }];
    setRelays(updatedRelays);
    
    // Save to localStorage and reinitialize NDK
    const relayUrls = updatedRelays.map(r => r.url);
    saveStoredRelays(relayUrls);

    void reconnectWithRelays(relayUrls);
    
    setNewRelayUrl("");
  };

  const handleRemoveRelay = (url: string) => {
    const updatedRelays = relays.filter(r => r.url !== url);
    setRelays(updatedRelays);
    
    // Save to localStorage
    const relayUrls = updatedRelays.map(r => r.url);
    saveStoredRelays(relayUrls);

    void reconnectWithRelays(relayUrls);
  };

  const handleReconnect = () => {
    void reconnectWithRelays(relays.map(r => r.url));
  };

  const addDefaultRelays = () => {
    const defaults = [
      "wss://relay.damus.io",
      "wss://relay.nostr.band",
      "wss://nos.lol",
    ];

    const existing = new Set(relays.map(r => r.url));
    const urlsToAdd = defaults.filter(url => !existing.has(url));

    if (urlsToAdd.length === 0) return;

    const updatedRelays = [
      ...relays,
      ...urlsToAdd.map(url => ({ url, connected: false, checked: false })),
    ];

    setRelays(updatedRelays);
    const relayUrls = updatedRelays.map(r => r.url);
    saveStoredRelays(relayUrls);
    void reconnectWithRelays(relayUrls);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 text-[var(--primary)] hover:text-[var(--primary-dark)] font-bold"
      >
        <ArrowLeft size={20} />
        Back
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Relay Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your Nostr relays
          </p>
        </div>
        <button
          onClick={handleReconnect}
          disabled={isConnecting}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/70 rounded-lg font-bold text-sm transition-all disabled:opacity-50"
        >
          <RefreshCw size={16} className={isConnecting ? "animate-spin" : ""} />
          {isConnecting ? "Connecting..." : "Reconnect"}
        </button>
      </div>

      {/* Add New Relay */}
      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <h2 className="font-bold mb-3">Add Relay</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newRelayUrl}
            onChange={(e) => setNewRelayUrl(e.target.value)}
            placeholder="wss://relay.example.com"
            className="flex-1 bg-accent/50 border-none rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-[var(--primary)]"
            onKeyDown={(e) => e.key === "Enter" && handleAddRelay()}
          />
          <button
            onClick={handleAddRelay}
            disabled={!newRelayUrl.trim()}
            className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-bold text-sm hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-all flex items-center gap-2"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Tip: You can also type just the domain (e.g., relay.damus.io) and we'll add wss:// automatically.
        </p>
      </div>

      {/* Your Relays */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Your Relays ({relays.length})</h2>
          <button
            onClick={checkAllRelays}
            className="text-sm text-[var(--primary)] hover:text-[var(--primary-dark)] font-medium"
          >
            Check All
          </button>
        </div>
        
        {relays.length === 0 ? (
          <div className="bg-card border rounded-xl p-6 text-center text-muted-foreground">
            <Server size={48} className="mx-auto mb-4 opacity-30" />
            <p>No relays configured.</p>
            <p className="text-sm mt-2">Add your first relay above or use the defaults below.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {relays.map((relay) => (
              <div
                key={relay.url}
                className="bg-card border rounded-xl p-4 shadow-sm flex items-center justify-between hover:border-[var(--primary)]/20 transition-all"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {relay.checked ? (
                    relay.connected ? (
                      <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
                    ) : (
                      <AlertCircle size={18} className="text-red-600 flex-shrink-0" />
                    )
                  ) : (
                    <div className="w-[18px] h-[18px] rounded-full border-2 border-[var(--primary)]/30 border-t-[var(--primary)] animate-spin flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <a
                      href={relay.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground font-mono text-sm hover:text-[var(--primary)] truncate block"
                    >
                      {relay.url}
                    </a>
                    {relay.checked && (
                      <span className={`text-xs ${relay.connected ? "text-green-600" : "text-red-600"}`}>
                        {relay.connected ? "Connected" : "Disconnected"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => checkRelayStatus(relay.url)}
                    className="p-2 text-muted-foreground hover:text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-lg transition-all"
                    title="Check connection"
                  >
                    <RefreshCw size={16} />
                  </button>
                  
                  <button
                    onClick={() => handleRemoveRelay(relay.url)}
                    className="p-2 text-red-600 hover:bg-red-500/10 rounded-lg transition-all"
                    title="Remove relay"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Default Relays */}
      <div className="bg-accent/30 border border-accent rounded-xl p-4">
        <h3 className="font-bold mb-2">Quick Add Popular Relays</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Add some popular public relays to connect with more users.
        </p>
        
        <button
          onClick={addDefaultRelays}
          className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-bold text-sm hover:bg-[var(--primary-dark)] transition-all"
        >
          Add Default Relays
        </button>
      </div>
    </div>
  );
}
