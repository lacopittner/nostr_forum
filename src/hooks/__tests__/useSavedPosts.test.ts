import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSavedPosts } from '../useSavedPosts';
import { mockNDK, resetMocks } from '../../test/mocks';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { ReactNode } from 'react';

// Create wrapper with mock context
const wrapper = ({ children }: { children: ReactNode }) => {
  // Mock the provider
  vi.doMock('../providers/NostrProvider', () => ({
    useNostr: () => ({
      ndk: mockNDK,
      user: {
        pubkey: 'test-pubkey',
        npub: 'npub1test',
      },
    }),
  }));
  return children;
};

describe('useSavedPosts', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllMocks();
  });

  it('should initialize with empty saved posts', () => {
    const { result } = renderHook(() => useSavedPosts(), { wrapper });
    
    expect(result.current.savedPosts).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isReady).toBe(false);
  });

  it('should save a post to localStorage', async () => {
    const { result } = renderHook(() => useSavedPosts(), { wrapper });
    
    const mockPost = {
      id: 'post-1',
      content: 'Test post content',
      pubkey: 'author-pubkey',
    } as NDKEvent;

    await act(async () => {
      await result.current.savePost(mockPost);
    });

    expect(result.current.savedPosts).toHaveLength(1);
    expect(result.current.savedPosts[0].postId).toBe('post-1');
    expect(result.current.isSaved('post-1')).toBe(true);
    
    // Verify localStorage was called
    expect(localStorage.setItem).toHaveBeenCalled();
  });

  it('should not save duplicate posts', async () => {
    const { result } = renderHook(() => useSavedPosts(), { wrapper });
    
    const mockPost = {
      id: 'post-1',
      content: 'Test post content',
      pubkey: 'author-pubkey',
    } as NDKEvent;

    await act(async () => {
      await result.current.savePost(mockPost);
      await result.current.savePost(mockPost);
    });

    expect(result.current.savedPosts).toHaveLength(1);
  });

  it('should unsave a post', async () => {
    const { result } = renderHook(() => useSavedPosts(), { wrapper });
    
    const mockPost = {
      id: 'post-1',
      content: 'Test post content',
      pubkey: 'author-pubkey',
    } as NDKEvent;

    await act(async () => {
      await result.current.savePost(mockPost);
    });

    expect(result.current.isSaved('post-1')).toBe(true);

    await act(async () => {
      await result.current.unsavePost('post-1');
    });

    expect(result.current.isSaved('post-1')).toBe(false);
    expect(result.current.savedPosts).toHaveLength(0);
  });

  it('should save a note with the post', async () => {
    const { result } = renderHook(() => useSavedPosts(), { wrapper });
    
    const mockPost = {
      id: 'post-1',
      content: 'Test post content',
      pubkey: 'author-pubkey',
    } as NDKEvent;

    await act(async () => {
      await result.current.savePost(mockPost, 'My note about this post');
    });

    expect(result.current.savedPosts[0].note).toBe('My note about this post');
  });

  it('should truncate long post content', async () => {
    const { result } = renderHook(() => useSavedPosts(), { wrapper });
    
    const longContent = 'a'.repeat(1000);
    const mockPost = {
      id: 'post-1',
      content: longContent,
      pubkey: 'author-pubkey',
    } as NDKEvent;

    await act(async () => {
      await result.current.savePost(mockPost);
    });

    expect(result.current.savedPosts[0].postContent.length).toBeLessThanOrEqual(500);
  });
});
