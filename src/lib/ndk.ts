import NDK from "@nostr-dev-kit/ndk";

// Default relay for first-time users
const DEFAULT_RELAYS: string[] = [];

// Get relays from localStorage or use defaults
export const getStoredRelays = (): string[] => {
  if (typeof window === "undefined") return DEFAULT_RELAYS;
  const stored = localStorage.getItem("nostr_relays");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return DEFAULT_RELAYS;

      return parsed.filter((relay): relay is string => {
        return typeof relay === "string" && relay.trim().length > 0;
      });
    } catch {
      return DEFAULT_RELAYS;
    }
  }
  return DEFAULT_RELAYS;
};

// Save relays to localStorage
export const saveStoredRelays = (relays: string[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem("nostr_relays", JSON.stringify(relays));
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
