import { useEffect, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useNostr } from "../providers/NostrProvider";

export function useCommunityBlocks(community: NDKEvent | null) {
  const { ndk, user } = useNostr();
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const communityD = community?.tags.find(t => t[0] === "d")?.[1] || "";
  const communityId = community ? `34550:${community.pubkey}:${communityD}` : "";

  useEffect(() => {
    if (!community) {
      setBlockedUsers(new Set());
      return;
    }

    setIsLoading(true);
    const sub = ndk.subscribe(
      {
        kinds: [34551 as any],
        authors: [community.pubkey],
        "#a": [communityId]
      },
      { closeOnEose: true }
    );

    const blocks: Array<{ pubkey: string; type: string; created_at: number }> = [];

    sub.on("event", (event: NDKEvent) => {
      const blockedPubkey = event.tags.find(t => t[0] === "p")?.[1];
      const blockType = event.tags.find(t => t[0] === "e")?.[1] || "block";
      if (blockedPubkey) {
        blocks.push({
          pubkey: blockedPubkey,
          type: blockType,
          created_at: event.created_at || 0
        });
      }
    });

    sub.on("eose", () => {
      // Process blocks - for each user, keep only the latest action
      const userBlocks = new Map<string, { type: string; created_at: number }>();
      
      blocks.forEach(block => {
        const existing = userBlocks.get(block.pubkey);
        if (!existing || block.created_at > existing.created_at) {
          userBlocks.set(block.pubkey, {
            type: block.type,
            created_at: block.created_at
          });
        }
      });

      // Build set of currently blocked users
      const currentlyBlocked = new Set<string>();
      userBlocks.forEach((data, pubkey) => {
        if (data.type === "block") {
          currentlyBlocked.add(pubkey);
        }
      });

      setBlockedUsers(currentlyBlocked);
      setIsLoading(false);
    });

    return () => {
      sub.stop();
    };
  }, [community, ndk, communityId]);

  const isUserBlocked = (pubkey: string): boolean => {
    return blockedUsers.has(pubkey);
  };

  const isCurrentUserBlocked = (): boolean => {
    if (!user) return false;
    return blockedUsers.has(user.pubkey);
  };

  return {
    blockedUsers,
    isUserBlocked,
    isCurrentUserBlocked,
    isLoading,
    blockCount: blockedUsers.size
  };
}
