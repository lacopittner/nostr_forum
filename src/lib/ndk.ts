import NDK from "@nostr-dev-kit/ndk";

const DEFAULT_FAILOVER_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
];

const parseRelayList = (value?: string): string[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((relay) => relay.trim())
    .filter((relay) => relay.length > 0);
};

const resolveRelativeRelayUrl = (relay: string): string => {
  if (typeof window === "undefined") return relay;
  if (!relay.startsWith("/")) return relay;

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.host}${relay}`;
};

const isWebSocketRelayUrl = (relay: string): boolean => {
  try {
    const parsed = new URL(relay);
    return parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
};

const ensureWebsocketScheme = (relay: string): string => {
  const trimmed = relay.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) return trimmed;
  return `wss://${trimmed}`;
};

const normalizeRelayList = (relays: string[]): string[] => {
  const normalized = relays
    .map(resolveRelativeRelayUrl)
    .map(ensureWebsocketScheme)
    .filter(isWebSocketRelayUrl);

  return Array.from(new Set(normalized));
};

const getDefaultRelays = (): string[] => {
  const configured = normalizeRelayList(parseRelayList(import.meta.env.VITE_NOSTR_RELAYS));
  return configured.length > 0 ? configured : [...DEFAULT_FAILOVER_RELAYS];
};

// Get relays from localStorage or use defaults
export const getStoredRelays = (): string[] => {
  const defaultRelays = getDefaultRelays();
  if (typeof window === "undefined") return defaultRelays;
  const stored = localStorage.getItem("nostr_relays");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return defaultRelays;

      const normalizedStored = normalizeRelayList(
        parsed.filter((relay): relay is string => typeof relay === "string")
      );
      return normalizedStored.length > 0 ? normalizedStored : defaultRelays;
    } catch {
      return defaultRelays;
    }
  }
  return defaultRelays;
};

// Save relays to localStorage
export const saveStoredRelays = (relays: string[]) => {
  if (typeof window === "undefined") return;
  const normalized = normalizeRelayList(relays);
  localStorage.setItem(
    "nostr_relays",
    JSON.stringify(normalized.length > 0 ? normalized : getDefaultRelays())
  );
};

class NDKService {
  private static instance: NDK;

  public static getInstance(): NDK {
    if (!NDKService.instance) {
      const config: ConstructorParameters<typeof NDK>[0] = {
        explicitRelayUrls: getStoredRelays(),
      };

      NDKService.instance = new NDK(config);
    }
    return NDKService.instance;
  }

  // Re-initialize with new relays
  public static reinitialize(relays: string[]): NDK {
    console.log("Reinitializing NDK with relays:", relays);
    
    // Get current signer if exists
    const currentSigner = NDKService.instance?.signer;
    
    // Save to localStorage
    saveStoredRelays(relays);
    
    // Create new instance
    NDKService.instance = new NDK({
      explicitRelayUrls: relays,
      signer: currentSigner,
    });
    
    // Connect
    NDKService.instance.connect().catch(console.error);
    
    return NDKService.instance;
  }

  // Allow resetting instance
  public static resetInstance(): void {
    NDKService.instance = null as any;
  }
}

export const ndk = NDKService.getInstance();
