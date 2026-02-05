import { vi } from 'vitest';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';

// Mock NDK class
export class MockNDK {
  signer = {
    user: vi.fn().mockResolvedValue({
      pubkey: 'test-pubkey',
      npub: 'npub1test',
      profile: { name: 'Test User' },
      fetchProfile: vi.fn().mockResolvedValue({ name: 'Test User' }),
    }),
    blockUntilReady: vi.fn().mockResolvedValue(undefined),
    encrypt: vi.fn().mockResolvedValue('encrypted'),
    decrypt: vi.fn().mockResolvedValue('decrypted'),
  };

  pool = {
    relays: new Map([
      ['ws://localhost:4433', { status: 1, on: vi.fn(), off: vi.fn() }],
    ]),
  };

  explicitRelayUrls = ['ws://localhost:4433'];

  connect = vi.fn().mockResolvedValue(undefined);

  subscribe = vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    off: vi.fn(),
    stop: vi.fn(),
  });

  fetchEvent = vi.fn().mockResolvedValue(null);
  
  fetchEvents = vi.fn().mockResolvedValue(new Set());

  getUser = vi.fn().mockReturnValue({
    fetchProfile: vi.fn().mockResolvedValue({ name: 'Test User' }),
  });

  publish = vi.fn().mockResolvedValue(undefined);
}

// Mock event factory
export const createMockEvent = (overrides: Partial<NDKEvent> = {}): NDKEvent => {
  const event = {
    id: 'test-event-id',
    pubkey: 'test-pubkey',
    created_at: Math.floor(Date.now() / 1000),
    kind: NDKKind.Text,
    content: 'Test content',
    tags: [],
    ...overrides,
  } as NDKEvent;
  return event;
};

// Mock ndk singleton
export const mockNDK = new MockNDK();

// Reset all mocks before each test
export const resetMocks = () => {
  vi.clearAllMocks();
  localStorage.clear();
};
