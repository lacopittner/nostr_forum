import NDK, { NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";

// Default relay for first-time users
const DEFAULT_RELAYS = ["ws://localhost:4433"];

// Get relays from localStorage or use defaults
export const getStoredRelays = (): string[] => {
  if (typeof window === "undefined") return DEFAULT_RELAYS;
  const stored = localStorage.getItem("nostr_relays");
  if (stored) {
    try {
      return JSON.parse(stored);
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

// Get dev key from environment (only for development!)
const getDevKey = (): string | null => {
  const devMode = import.meta.env.VITE_DEV_MODE === "true";
  if (devMode) {
    return import.meta.env.VITE_DEV_NSEC || null;
  }
  return null;
};

class NDKService {
  private static instance: NDK;

  public static getInstance(): NDK {
    if (!NDKService.instance) {
      // Priority: Private key from env (for dev). For normal runtime, signer is set after login.
      let signer;
      
      const devKey = getDevKey();
      if (devKey) {
        console.warn("Using development key - NOT FOR PRODUCTION!");
        signer = new NDKPrivateKeySigner(devKey);
      }

      const config: ConstructorParameters<typeof NDK>[0] = {
        explicitRelayUrls: getStoredRelays(),
      };

      if (signer) {
        config.signer = signer;
      }

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
