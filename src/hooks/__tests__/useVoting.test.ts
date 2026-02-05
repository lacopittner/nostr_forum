import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoting } from '../useVoting';
import { mockNDK, resetMocks, createMockEvent } from '../../test/mocks';
import { NDKEvent } from '@nostr-dev-kit/ndk';

// Mock the NostrProvider
vi.mock('../providers/NostrProvider', () => ({
  useNostr: () => ({
    ndk: mockNDK,
    user: {
      pubkey: 'test-pubkey',
    },
  }),
}));

describe('useVoting', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useVoting());
    
    expect(result.current.reactions).toEqual({});
    expect(result.current.userVotes).toEqual({});
    expect(result.current.votingIds.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('should handle upvote optimistically', async () => {
    const { result } = renderHook(() => useVoting());
    
    const mockPost = createMockEvent({ id: 'post-1' });

    // Initial state
    expect(result.current.reactions['post-1']).toBeUndefined();

    // Upvote
    await act(async () => {
      await result.current.handleReaction(mockPost, 'UPVOTE');
    });

    // Should update optimistically
    expect(result.current.reactions['post-1']).toBe(1);
    expect(result.current.userVotes['post-1']).toBe('UPVOTE');
  });

  it('should handle downvote', async () => {
    const { result } = renderHook(() => useVoting());
    
    const mockPost = createMockEvent({ id: 'post-1' });

    await act(async () => {
      await result.current.handleReaction(mockPost, 'DOWNVOTE');
    });

    expect(result.current.reactions['post-1']).toBe(-1);
    expect(result.current.userVotes['post-1']).toBe('DOWNVOTE');
  });

  it('should undo vote when clicking same vote type', async () => {
    const { result } = renderHook(() => useVoting());
    
    const mockPost = createMockEvent({ id: 'post-1' });

    // First upvote
    await act(async () => {
      await result.current.handleReaction(mockPost, 'UPVOTE');
    });

    expect(result.current.reactions['post-1']).toBe(1);

    // Click upvote again to undo
    await act(async () => {
      await result.current.handleReaction(mockPost, 'UPVOTE');
    });

    // Should be back to 0
    expect(result.current.reactions['post-1']).toBe(0);
    expect(result.current.userVotes['post-1']).toBeNull();
  });

  it('should change vote from upvote to downvote', async () => {
    const { result } = renderHook(() => useVoting());
    
    const mockPost = createMockEvent({ id: 'post-1' });

    // Upvote first
    await act(async () => {
      await result.current.handleReaction(mockPost, 'UPVOTE');
    });

    expect(result.current.reactions['post-1']).toBe(1);

    // Change to downvote
    await act(async () => {
      await result.current.handleReaction(mockPost, 'DOWNVOTE');
    });

    expect(result.current.reactions['post-1']).toBe(-1);
    expect(result.current.userVotes['post-1']).toBe('DOWNVOTE');
  });

  it('should process incoming reactions', async () => {
    const { result } = renderHook(() => useVoting());
    
    const incomingReaction = {
      id: 'reaction-1',
      pubkey: 'other-user',
      content: '+',
      created_at: Date.now() / 1000,
      tags: [['e', 'post-1']],
    } as NDKEvent;

    await act(async () => {
      result.current.processIncomingReaction(incomingReaction);
    });

    expect(result.current.reactions['post-1']).toBe(1);
  });

  it('should prevent double voting while processing', async () => {
    const { result } = renderHook(() => useVoting());
    
    const mockPost = createMockEvent({ id: 'post-1' });

    // Start first vote
    act(() => {
      // Fire but don't await to simulate concurrent clicks
      result.current.handleReaction(mockPost, 'UPVOTE');
    });

    // Try second vote immediately
    const secondVoteResult = await act(async () => {
      return await result.current.handleReaction(mockPost, 'UPVOTE');
    });

    // Second vote should be rejected
    expect(secondVoteResult).toBe(false);
  });
});
