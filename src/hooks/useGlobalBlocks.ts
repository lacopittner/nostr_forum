import { useCallback, useEffect, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useNostr } from "../providers/NostrProvider";
import { logger } from "../lib/logger";

const GLOBAL_MUTE_KIND = 10000;

export function useGlobalBlocks() {
  const { ndk, user } = useNostr();
  const [blockedPubkeys, setBlockedPubkeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setBlockedPubkeys(new Set());
      return;
    }

    setIsLoading(true);

    const sub = ndk.subscribe(
      {
        kinds: [GLOBAL_MUTE_KIND],
        authors: [user.pubkey],
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
      const blocked = new Set<string>();

      latestEvent?.tags.forEach(tag => {
        if (tag[0] === "p" && tag[1]) {
          blocked.add(tag[1]);
        }
      });

      setBlockedPubkeys(blocked);
      setIsLoading(false);
    });

    return () => {
      sub.stop();
    };
  }, [ndk, user]);

  const publishBlockedList = useCallback(async (nextBlocked: Set<string>) => {
    const event = new NDKEvent(ndk);
    event.kind = GLOBAL_MUTE_KIND;
    event.content = "";
    event.tags = Array.from(nextBlocked).map(pubkey => ["p", pubkey]);
    await event.publish();
  }, [ndk]);

  const blockUser = useCallback(async (pubkey: string): Promise<boolean> => {
    if (!user || !pubkey || blockedPubkeys.has(pubkey)) return false;

    try {
      const nextBlocked = new Set(blockedPubkeys);
      nextBlocked.add(pubkey);
      await publishBlockedList(nextBlocked);
      setBlockedPubkeys(nextBlocked);
      return true;
    } catch (error) {
      logger.error("Failed to block user globally", error);
      return false;
    }
  }, [user, blockedPubkeys, publishBlockedList]);

  const unblockUser = useCallback(async (pubkey: string): Promise<boolean> => {
    if (!user || !pubkey || !blockedPubkeys.has(pubkey)) return false;

    try {
      const nextBlocked = new Set(blockedPubkeys);
      nextBlocked.delete(pubkey);
      await publishBlockedList(nextBlocked);
      setBlockedPubkeys(nextBlocked);
      return true;
    } catch (error) {
      logger.error("Failed to unblock user globally", error);
      return false;
    }
  }, [user, blockedPubkeys, publishBlockedList]);

  const isBlocked = useCallback((pubkey: string): boolean => {
    return blockedPubkeys.has(pubkey);
  }, [blockedPubkeys]);

  return {
    blockedPubkeys,
    isBlocked,
    blockUser,
    unblockUser,
    isLoading,
    blockedCount: blockedPubkeys.size,
  };
}
