import { useEffect, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useNostr } from "../providers/NostrProvider";

// Kind 30001 - Categorized People List (NIP-51)
const COMMUNITY_LIST_KIND = 30001;

export function useCommunityMembership() {
  const { ndk, user, requireSigner } = useNostr();
  const [joinedCommunities, setJoinedCommunities] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setJoinedCommunities(new Set());
      return;
    }

    setIsLoading(true);
    
    // Fetch user's community list
    const sub = ndk.subscribe(
      {
        kinds: [COMMUNITY_LIST_KIND],
        authors: [user.pubkey],
        "#d": ["communities"]
      },
      { closeOnEose: true }
    );

    let latestEvent: NDKEvent | null = null;

    sub.on("event", (event: NDKEvent) => {
      const createdAt = event.created_at || 0;
      if (!latestEvent || createdAt > (latestEvent.created_at || 0)) {
        latestEvent = event;
      }
    });

    sub.on("eose", () => {
      const communities = new Set<string>();

      latestEvent?.tags.forEach(tag => {
        if (tag[0] === "a" && tag[1].startsWith("34550:")) {
          communities.add(tag[1]);
        }
      });

      setJoinedCommunities(communities);
      setIsLoading(false);
    });

    return () => {
      sub.stop();
    };
  }, [ndk, user]);

  const joinCommunity = async (communityPubkey: string, communityId: string) => {
    if (!user) return false;

    // Ensure signer is available for signing
    const hasSigner = await requireSigner();
    if (!hasSigner) return false;

    try {
      const communityATag = `34550:${communityPubkey}:${communityId}`;
      
      // Check if already joined
      if (joinedCommunities.has(communityATag)) return true;

      // Create or update community list
      const event = new NDKEvent(ndk);
      event.kind = COMMUNITY_LIST_KIND;
      event.content = "";
      
      const newCommunities = new Set(joinedCommunities);
      newCommunities.add(communityATag);
      
      event.tags = [
        ["d", "communities"],
        ...Array.from(newCommunities).map(atag => ["a", atag])
      ];

      await event.publish();
      setJoinedCommunities(newCommunities);
      return true;
    } catch (error) {
      console.error("Failed to join community", error);
      return false;
    }
  };

  const leaveCommunity = async (communityPubkey: string, communityId: string) => {
    if (!user) return false;

    // Ensure signer is available for signing
    const hasSigner = await requireSigner();
    if (!hasSigner) return false;

    try {
      const communityATag = `34550:${communityPubkey}:${communityId}`;
      
      // Check if not joined
      if (!joinedCommunities.has(communityATag)) return true;

      // Create updated community list without this community
      const event = new NDKEvent(ndk);
      event.kind = COMMUNITY_LIST_KIND;
      event.content = "";
      
      const newCommunities = new Set(joinedCommunities);
      newCommunities.delete(communityATag);
      
      event.tags = [
        ["d", "communities"],
        ...Array.from(newCommunities).map(atag => ["a", atag])
      ];

      await event.publish();
      setJoinedCommunities(newCommunities);
      return true;
    } catch (error) {
      console.error("Failed to leave community", error);
      return false;
    }
  };

  const isMember = (communityPubkey: string, communityId: string): boolean => {
    return joinedCommunities.has(`34550:${communityPubkey}:${communityId}`);
  };

  return {
    joinedCommunities,
    isMember,
    joinCommunity,
    leaveCommunity,
    isLoading,
    joinedCount: joinedCommunities.size
  };
}
