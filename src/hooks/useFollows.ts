import { useState, useEffect, useCallback } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { useNostr } from "../providers/NostrProvider";
import { logger } from "../lib/logger";

export function useFollows() {
  const { ndk, user } = useNostr();
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [followers, setFollowers] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // Load following list when user logs in
  useEffect(() => {
    if (!user) {
      setFollowing(new Set());
      setFollowers(new Set());
      return;
    }

    const loadFollows = async () => {
      setIsLoading(true);
      try {
        // Fetch Kind 3 (contacts) event for current user
        const filter = {
          kinds: [NDKKind.Contacts],
          authors: [user.pubkey],
          limit: 1,
        };

        const events = await ndk.fetchEvents(filter);
        const contactEvent = Array.from(events)[0];

        if (contactEvent) {
          // Extract pubkeys from 'p' tags
          const followedPubkeys = contactEvent.tags
            .filter((tag) => tag[0] === "p")
            .map((tag) => tag[1]);
          setFollowing(new Set(followedPubkeys));
        }

        // Fetch followers (who follows the current user)
        const followerFilter = {
          kinds: [NDKKind.Contacts],
          "#p": [user.pubkey],
        };

        const followerEvents = await ndk.fetchEvents(followerFilter);
        const followerPubkeys = Array.from(followerEvents).map((e) => e.pubkey);
        setFollowers(new Set(followerPubkeys));
      } catch (error) {
        logger.error("Failed to load follows:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFollows();
  }, [ndk, user]);

  const isFollowing = useCallback(
    (pubkey: string) => {
      return following.has(pubkey);
    },
    [following]
  );

  const follow = useCallback(
    async (pubkey: string) => {
      if (!user) return false;

      try {
        // Create new Kind 3 event with updated following list
        const event = new NDKEvent(ndk);
        event.kind = NDKKind.Contacts;

        // Add all currently followed pubkeys plus the new one
        const newFollowing = new Set(following);
        newFollowing.add(pubkey);

        event.tags = Array.from(newFollowing).map((pk) => ["p", pk]);

        await event.publish();
        setFollowing(newFollowing);
        return true;
      } catch (error) {
        logger.error("Failed to follow user:", error);
        return false;
      }
    },
    [ndk, user, following]
  );

  const unfollow = useCallback(
    async (pubkey: string) => {
      if (!user) return false;

      try {
        // Create new Kind 3 event with updated following list
        const event = new NDKEvent(ndk);
        event.kind = NDKKind.Contacts;

        // Remove the pubkey from following
        const newFollowing = new Set(following);
        newFollowing.delete(pubkey);

        event.tags = Array.from(newFollowing).map((pk) => ["p", pk]);

        await event.publish();
        setFollowing(newFollowing);
        return true;
      } catch (error) {
        logger.error("Failed to unfollow user:", error);
        return false;
      }
    },
    [ndk, user, following]
  );

  return {
    following,
    followers,
    isFollowing,
    follow,
    unfollow,
    isLoading,
    followingCount: following.size,
    followersCount: followers.size,
  };
}
