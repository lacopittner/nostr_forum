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

export function useSavedPosts() {
  const { ndk, user } = useNostr();
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Fetch saved posts on mount
  useEffect(() => {
    if (!user) {
      setSavedPosts([]);
      setIsReady(true);
      return;
    }

    loadSavedPosts();
  }, [user, ndk]);

  const loadSavedPosts = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Query for encrypted bookmark events
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
            // Decrypt content
            const decrypted = await ndk.signer?.decrypt(
              user,
              latestEvent.content
            );
            
            if (decrypted) {
              const posts: SavedPost[] = JSON.parse(decrypted);
              setSavedPosts(posts);
            }
          } catch (e) {
            console.error("Failed to decrypt saved posts", e);
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
    if (!user) return false;

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
      
      // Encrypt content
      const jsonContent = JSON.stringify(updatedPosts);
      const encrypted = await (ndk.signer as any)?.encrypt(
        user.pubkey,
        user.pubkey,
        jsonContent
      );

      if (!encrypted) {
        throw new Error("Encryption failed");
      }

      // Create bookmark event
      const event = new NDKEvent(ndk);
      event.kind = BOOKMARKS_KIND;
      event.content = encrypted;
      event.tags = [
        ["d", SAVED_POSTS_TAG],
        ["client", "nostr-reddit"]
      ];

      await event.publish();
      setSavedPosts(updatedPosts);
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
      
      // Encrypt updated content
      const jsonContent = JSON.stringify(updatedPosts);
      const encrypted = await (ndk.signer as any)?.encrypt(
        user.pubkey,
        user.pubkey,
        jsonContent
      );

      if (!encrypted) {
        throw new Error("Encryption failed");
      }

      // Create bookmark event
      const event = new NDKEvent(ndk);
      event.kind = BOOKMARKS_KIND;
      event.content = encrypted;
      event.tags = [
        ["d", SAVED_POSTS_TAG],
        ["client", "nostr-reddit"]
      ];

      await event.publish();
      setSavedPosts(updatedPosts);
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
