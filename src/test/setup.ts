import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.nostr
Object.defineProperty(window, 'nostr', {
  value: {
    getPublicKey: vi.fn().mockResolvedValue('npub1test'),
    signEvent: vi.fn().mockResolvedValue({ id: 'test-id', sig: 'test-sig' }),
    getRelays: vi.fn().mockResolvedValue({}),
    nip04: {
      encrypt: vi.fn().mockResolvedValue('encrypted'),
      decrypt: vi.fn().mockResolvedValue('decrypted'),
    },
  },
  writable: true,
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: IntersectionObserverMock,
});

// Suppress console errors during tests
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  // Filter out React act() warnings
  if (typeof args[0] === 'string' && args[0].includes('act')) {
    return;
  }
  originalConsoleError(...args);
};
