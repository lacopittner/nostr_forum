/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NOSTR_RELAYS?: string;
  readonly VITE_DEV_MODE?: string;
  readonly VITE_DEV_NSEC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// NIP-07 window.nostr extension interface
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: any): Promise<any>;
      getRelays?(): Promise<any>;
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}

export {};