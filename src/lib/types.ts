// NDK Profile type definition (matches NDKUserProfile)
export interface NDKProfile {
  name?: string;
  displayName?: string;
  image?: string;
  banner?: string;
  bio?: string;
  nip05?: string;
  lud06?: string;
  lud16?: string;
  about?: string;
  website?: string;
  [key: string]: string | number | undefined;
}

// Nostr event kinds we use
export enum NostrKind {
  Metadata = 0,
  Text = 1,
  RecommendRelay = 2,
  Contacts = 3,
  EncryptedDM = 4,
  EventDeletion = 5,
  Reaction = 7,
  ChannelCreation = 40,
  ChannelMetadata = 41,
  ChannelMessage = 42,
  ChannelHideMessage = 43,
  ChannelMuteUser = 44,
  // NIP-72 Community
  Community = 34550,
  CommunityBlock = 34551,
  // NIP-51 Lists
  CategorizedPeople = 30000,
  CategorizedBookmarks = 30001,
  // NIP-65 Relay List
  RelayList = 10002,
}

// Community event structure
export interface CommunityInfo {
  id: string;
  pubkey: string;
  name: string;
  description: string;
  image?: string;
  rules?: string;
  moderators: string[];
  flairs: string[];
}

// Toast types
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}
