import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCommunityMembership } from '../useCommunityMembership';
import { mockNDK, resetMocks } from '../../test/mocks';

// Mock the NostrProvider
vi.mock('../providers/NostrProvider', () => ({
  useNostr: () => ({
    ndk: mockNDK,
    user: {
      pubkey: 'test-pubkey',
    },
  }),
}));

describe('useCommunityMembership', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should initialize with empty membership', () => {
    const { result } = renderHook(() => useCommunityMembership());
    
    expect(result.current.joinedCommunities.size).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.joinedCount).toBe(0);
  });

  it('should check if user is member of community', async () => {
    const { result } = renderHook(() => useCommunityMembership());
    
    // Mock subscription response
    const mockSubscription = {
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === 'event') {
          // Simulate receiving a community list event
          callback({
            tags: [
              ['d', 'communities'],
              ['a', '34550:pubkey1:community1'],
              ['a', '34550:pubkey2:community2'],
            ],
          });
        }
        if (event === 'eose') {
          callback();
        }
        return mockSubscription;
      }),
      off: vi.fn(),
      stop: vi.fn(),
    };
    
    mockNDK.subscribe.mockReturnValue(mockSubscription);

    expect(result.current.isMember('pubkey1', 'community1')).toBe(false);
  });

  it('should join a community', async () => {
    const { result } = renderHook(() => useCommunityMembership());
    
    const joinResult = await act(async () => {
      return await result.current.joinCommunity('pubkey1', 'community1');
    });

    expect(joinResult).toBe(true);
    expect(result.current.isMember('pubkey1', 'community1')).toBe(true);
    expect(mockNDK.publish).toHaveBeenCalled();
  });

  it('should leave a community', async () => {
    const { result } = renderHook(() => useCommunityMembership());
    
    // First join
    await act(async () => {
      await result.current.joinCommunity('pubkey1', 'community1');
    });

    expect(result.current.isMember('pubkey1', 'community1')).toBe(true);

    // Then leave
    const leaveResult = await act(async () => {
      return await result.current.leaveCommunity('pubkey1', 'community1');
    });

    expect(leaveResult).toBe(true);
    expect(result.current.isMember('pubkey1', 'community1')).toBe(false);
  });

  it('should not fail when leaving non-joined community', async () => {
    const { result } = renderHook(() => useCommunityMembership());
    
    const leaveResult = await act(async () => {
      return await result.current.leaveCommunity('pubkey1', 'community1');
    });

    expect(leaveResult).toBe(true);
  });

  it('should return correct joinedCount', async () => {
    const { result } = renderHook(() => useCommunityMembership());
    
    await act(async () => {
      await result.current.joinCommunity('pubkey1', 'community1');
      await result.current.joinCommunity('pubkey2', 'community2');
    });

    expect(result.current.joinedCount).toBe(2);
  });
});
