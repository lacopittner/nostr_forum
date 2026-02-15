import { beforeEach, describe, it, expect, vi } from 'vitest';
import { getStoredRelays, saveStoredRelays } from '../lib/ndk';

const getExpectedDefaultRelays = (): string[] => {
  const configured = (import.meta.env.VITE_NOSTR_RELAYS ?? '')
    .split(',')
    .map((relay: string) => relay.trim())
    .filter((relay: string) => relay.length > 0);

  return configured
    .map((relay: string) => {
      if (!relay.startsWith('/')) return relay;
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${window.location.host}${relay}`;
    })
    .filter((relay: string) => relay.startsWith('ws://') || relay.startsWith('wss://'));
};

describe('NDK Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return default relays when localStorage is empty', () => {
    localStorage.getItem = () => null;
    const relays = getStoredRelays();
    expect(relays).toEqual(getExpectedDefaultRelays());
  });

  it('should parse stored relays from localStorage', () => {
    localStorage.getItem = () => JSON.stringify(['wss://relay1.com', 'wss://relay2.com']);
    const relays = getStoredRelays();
    expect(relays).toEqual(['wss://relay1.com', 'wss://relay2.com']);
  });

  it('should save relays to localStorage', () => {
    const relays = ['wss://relay1.com'];
    saveStoredRelays(relays);
    expect(localStorage.setItem).toHaveBeenCalled();
    const callArgs = (localStorage.setItem as any).mock.calls[0];
    expect(callArgs[0]).toBe('nostr_relays');
    expect(JSON.parse(callArgs[1])).toEqual(relays);
  });

  it('should handle invalid JSON in localStorage', () => {
    localStorage.getItem = () => 'invalid-json';
    const relays = getStoredRelays();
    expect(relays).toEqual(getExpectedDefaultRelays());
  });

  it('should ignore non-array values in localStorage', () => {
    localStorage.getItem = () => JSON.stringify({ relay: 'wss://relay1.com' });
    const relays = getStoredRelays();
    expect(relays).toEqual(getExpectedDefaultRelays());
  });
});
