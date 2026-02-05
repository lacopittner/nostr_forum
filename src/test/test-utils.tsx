import React from 'react';
import { render } from '@testing-library/react';
import { NostrProvider } from '../providers/NostrProvider';
import { mockNDK } from './mocks';
import { vi } from 'vitest';

// Mock useNostr to return our mock values
export const mockUseNostr = {
  ndk: mockNDK,
  user: {
    pubkey: 'test-pubkey',
    npub: 'npub1test',
    profile: { name: 'Test User' },
  },
  login: vi.fn(),
  loginWith_nsec: vi.fn(),
  logout: vi.fn(),
  theme: 'light' as const,
  toggleTheme: vi.fn(),
  connectionStatus: 'connected' as const,
  reconnect: vi.fn(),
};

// Wrapper component with NostrProvider
export function renderWithProviders(ui: React.ReactElement) {
  return render(
    <NostrProvider>{ui}</NostrProvider>
  );
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { renderWithProviders as render };
