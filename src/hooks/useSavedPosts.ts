import { useEffect, useState, useCallback } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useNostr } from "../providers/NostrProvider";

// Kind 30001 - Categorized Bookmarks (NIP-51)
const BOOKMARKS_KIND = 30001;
const SAVED_POSTS_TAG = "saved_posts";

interface SavedPost {
  postId: string;
  postContent: string;
  authorPubkey: string;
  savedAt: number;
  note?: string;
}

// Local storage key for saved posts
const getStorageKey = (pubkey: string) => `nostr_saved_posts_${pubkey}`;

export function useSavedPosts() {
  const { ndk, user } = useNostr();
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Load saved posts from localStorage on mount
  useEffect(() => {
    if (!user) {
      setSavedPosts([]);
      setIsReady(true);
      return;
    }

    // First load from localStorage for instant display
    const stored = localStorage.getItem(getStorageKey(user.pubkey));
    if (stored) {
      try {
        const posts: SavedPost[] = JSON.parse(stored);
        setSavedPosts(posts);
      } catch {
        console.log("Failed to parse stored saved posts");
      }
    }

    // Then try to sync from Nostr
    loadSavedPosts();
  }, [user]);

  const loadSavedPosts = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Query for bookmark events
      const sub = ndk.subscribe(
        {
          kinds: [BOOKMARKS_KIND],
          authors: [user.pubkey],
          "#d": [SAVED_POSTS_TAG]
        },
        { closeOnEose: true }
      );

      let latestEvent: NDKEvent | null = null;

      sub.on("event", (event: NDKEvent) => {
        if (!latestEvent || (event.created_at || 0) > (latestEvent.created_at || 0)) {
          latestEvent = event;
        }
      });

      sub.on("eose", async () => {
        if (latestEvent?.content) {
          try {
            let posts: SavedPost[];
            
            // Try to parse as JSON first (unencrypted)
            try {
              posts = JSON.parse(latestEvent.content);
            } catch {
              // If that fails, try to decrypt (for backwards compatibility)
              try {
                const decrypted = await ndk.signer?.decrypt(
                  user,
                  latestEvent.content
                );
                posts = JSON.parse(decrypted || "[]");
              } catch {
                posts = [];
              }
            }
            
            if (posts.length > 0) {
              setSavedPosts(posts);
              localStorage.setItem(getStorageKey(user.pubkey), JSON.stringify(posts));
            }
          } catch (e) {
            console.error("Failed to parse saved posts", e);
          }
        }
        setIsLoading(false);
        setIsReady(true);
      });
    } catch (error) {
      console.error("Failed to load saved posts", error);
      setIsLoading(false);
      setIsReady(true);
    }
  };

  const savePost = async (post: NDKEvent, note?: string): Promise<boolean> => {
    if (!user) {
      alert("Please log in to save posts");
      return false;
    }

    try {
      // Check if already saved
      if (savedPosts.some(sp => sp.postId === post.id)) {
        return true;
      }

      const newSavedPost: SavedPost = {
        postId: post.id,
        postContent: post.content.slice(0, 500), // Limit content length
        authorPubkey: post.pubkey,
        savedAt: Date.now(),
        note
      };

      const updatedPosts = [...savedPosts, newSavedPost];
      
      // Save to localStorage first
      localStorage.setItem(getStorageKey(user.pubkey), JSON.stringify(updatedPosts));
      setSavedPosts(updatedPosts);
      
      // Try to publish to Nostr (unencrypted for simplicity)
      try {
        const event = new NDKEvent(ndk);
        event.kind = BOOKMARKS_KIND;
        event.content = JSON.stringify(updatedPosts);
        event.tags = [
          ["d", SAVED_POSTS_TAG],
          ["client", "nostr-reddit"]
        ];

        await event.publish();
      } catch (e) {
        console.log("Failed to publish to Nostr, but saved locally");
      }
      
      return true;
    } catch (error) {
      console.error("Failed to save post", error);
      return false;
    }
  };

  const unsavePost = async (postId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const updatedPosts = savedPosts.filter(sp => sp.postId !== postId);
      
      // Update localStorage
      localStorage.setItem(getStorageKey(user.pubkey), JSON.stringify(updatedPosts));
      setSavedPosts(updatedPosts);
      
      // Try to publish to Nostr
      try {
        const event = new NDKEvent(ndk);
        event.kind = BOOKMARKS_KIND;
        event.content = JSON.stringify(updatedPosts);
        event.tags = [
          ["d", SAVED_POSTS_TAG],
          ["client", "nostr-reddit"]
        ];

        await event.publish();
      } catch (e) {
        console.log("Failed to publish to Nostr, but removed locally");
      }
      
      return true;
    } catch (error) {
      console.error("Failed to unsave post", error);
      return false;
    }
  };

  const isSaved = useCallback((postId: string): boolean => {
    return savedPosts.some(sp => sp.postId === postId);
  }, [savedPosts]);

  return {
    savedPosts,
    isSaved,
    savePost,
    unsavePost,
    isLoading,
    isReady,
    refresh: loadSavedPosts
  };
}
