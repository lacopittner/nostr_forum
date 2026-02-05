/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NOSTR_RELAYS?: string;
  readonly VITE_NOSTR_DEV_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}