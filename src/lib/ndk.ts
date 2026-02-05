import NDK, { NDKNip07Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";

// Default relay for development
const DEFAULT_RELAYS = [
  "ws://localhost:4433",
];

// Get relay URLs from environment or use defaults
const getRelayUrls = (): string[] => {
  if (typeof window !== 'undefined' && window.NOSTR_RELAYS) {
    return window.NOSTR_RELAYS;
  }
  return DEFAULT_RELAYS;
};

// Get dev key from environment (only for development!)
const getDevKey = (): string | null => {
  if (typeof window !== 'undefined' && window.NOSTR_DEV_KEY) {
    return window.NOSTR_DEV_KEY;
  }
  return null;
};

class NDKService {
  private static instance: NDK;

  public static getInstance(): NDK {
    if (!NDKService.instance) {
      // Priority: Private key from env (for dev), then NIP-07
      let signer;
      
      const devKey = getDevKey();
      if (devKey) {
        console.warn("Using development key - NOT FOR PRODUCTION!");
        signer = new NDKPrivateKeySigner(devKey);
      } else {
        signer = new NDKNip07Signer();
      }
      
      NDKService.instance = new NDK({
        explicitRelayUrls: getRelayUrls(),
        signer: signer,
      });
    }
    return NDKService.instance;
  }

  // Allow resetting instance (for testing or relay changes)
  public static resetInstance(): void {
    NDKService.instance = null as any;
  }
}

// Extend Window interface for global config
declare global {
  interface Window {
    NOSTR_RELAYS?: string[];
    NOSTR_DEV_KEY?: string;
  }
}

export const ndk = NDKService.getInstance();
