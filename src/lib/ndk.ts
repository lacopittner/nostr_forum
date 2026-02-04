import NDK, { NDKNip07Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";

const DEFAULT_RELAYS = [
  "ws://localhost:4433",
];

class NDKService {
  private static instance: NDK;

  public static getInstance(): NDK {
    if (!NDKService.instance) {
      // Priority: Private key from env/file (for dev), then NIP-07
      let signer;
      
      // Check if we have a hardcoded key for local development
      // In a real app, this would be handled via a more secure login flow
      const devKey = "nsec1z7mjk96evt7485gvwexfhqy3qyf5mckazkqed5rwwv7zlalwglrsv3dw0k"; 
      if (devKey) {
        signer = new NDKPrivateKeySigner(devKey);
      } else {
        signer = new NDKNip07Signer();
      }
      
      NDKService.instance = new NDK({
        explicitRelayUrls: DEFAULT_RELAYS,
        signer: signer,
      });
    }
    return NDKService.instance;
  }
}

export const ndk = NDKService.getInstance();
