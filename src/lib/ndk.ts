import NDK, { NDKNip07Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";

// Default relay for development
const DEFAULT_RELAYS = [
  "ws://localhost:4433",
];

// Get relay URLs from Vite environment or use defaults
const getRelayUrls = (): string[] => {
  // Vite exposes env vars on import.meta.env
  const envRelays = import.meta.env.VITE_NOSTR_RELAYS;
  if (envRelays) {
    return envRelays.split(",").map((r: string) => r.trim()).filter(Boolean);
  }
  return DEFAULT_RELAYS;
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

export const ndk = NDKService.getInstance();
