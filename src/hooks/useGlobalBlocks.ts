import { useCallback, useEffect, useMemo, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useNostr } from "../providers/NostrProvider";
import { logger } from "../lib/logger";
import { publishWithRelayFailover } from "../lib/publish";

const GLOBAL_MUTE_KIND = 10000;
const GLOBAL_MUTE_ALT_KIND = 30000;

const normalizeTag = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
};

const extractEventHashtags = (event: NDKEvent): string[] => {
  const tagHashtags = event.tags
    .filter((tag) => tag[0] === "t" && tag[1])
    .map((tag) => normalizeTag(tag[1]));

  const inlineHashtags = Array.from(event.content.matchAll(/#([a-z0-9_-]+)/gi)).map((match) =>
    normalizeTag(match[1] || "")
  );

  return Array.from(new Set([...tagHashtags, ...inlineHashtags])).filter(Boolean);
};

const isMuteListEvent = (event: NDKEvent): boolean => {
  if (event.kind === GLOBAL_MUTE_KIND) return true;
  if (event.kind !== GLOBAL_MUTE_ALT_KIND) return false;

  const dTag = event.tags.find((tag) => tag[0] === "d")?.[1]?.toLowerCase();
  return dTag === "mute" || dTag === "mute-list" || dTag === "global-mute";
};

interface MuteListState {
  blockedPubkeys: Set<string>;
  mutedTags: Set<string>;
  mutedEventIds: Set<string>;
}

const createEmptyMuteState = (): MuteListState => ({
  blockedPubkeys: new Set<string>(),
  mutedTags: new Set<string>(),
  mutedEventIds: new Set<string>(),
});

const sortValues = (values: Iterable<string>): string[] => {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
};

export function useGlobalBlocks() {
  const { ndk, user } = useNostr();
  const [muteState, setMuteState] = useState<MuteListState>(createEmptyMuteState);
  const [isLoading, setIsLoading] = useState(false);

  const blockedPubkeys = muteState.blockedPubkeys;
  const mutedTags = muteState.mutedTags;
  const mutedEventIds = muteState.mutedEventIds;

  useEffect(() => {
    if (!user) {
      setMuteState(createEmptyMuteState());
      return;
    }

    setIsLoading(true);

    const sub = ndk.subscribe(
      {
        kinds: [GLOBAL_MUTE_KIND, GLOBAL_MUTE_ALT_KIND],
        authors: [user.pubkey],
      },
      { closeOnEose: true }
    );

    let latestEvent: NDKEvent | null = null;

    sub.on("event", (event: NDKEvent) => {
      if (!isMuteListEvent(event)) return;
      const createdAt = event.created_at || 0;
      if (!latestEvent || createdAt > (latestEvent.created_at || 0)) {
        latestEvent = event;
      }
    });

    sub.on("eose", () => {
      const nextState = createEmptyMuteState();

      if (latestEvent && isMuteListEvent(latestEvent)) {
        latestEvent.tags.forEach((tag) => {
          if (tag[0] === "p" && tag[1]) {
            nextState.blockedPubkeys.add(tag[1].trim());
            return;
          }
          if (tag[0] === "t" && tag[1]) {
            const normalizedTag = normalizeTag(tag[1]);
            if (normalizedTag) {
              nextState.mutedTags.add(normalizedTag);
            }
            return;
          }
          if (tag[0] === "e" && tag[1]) {
            nextState.mutedEventIds.add(tag[1].trim());
          }
        });
      }

      setMuteState(nextState);
      setIsLoading(false);
    });

    sub.on("close", () => {
      setIsLoading(false);
    });

    return () => {
      sub.stop();
    };
  }, [ndk, user]);

  const publishMutedList = useCallback(
    async (nextState: MuteListState) => {
      const event = new NDKEvent(ndk);
      event.kind = GLOBAL_MUTE_KIND;
      event.content = "";
      event.tags = [
        ...sortValues(nextState.blockedPubkeys).map((pubkey) => ["p", pubkey]),
        ...sortValues(nextState.mutedTags).map((tag) => ["t", tag]),
        ...sortValues(nextState.mutedEventIds).map((eventId) => ["e", eventId]),
      ];
      await publishWithRelayFailover(event);
    },
    [ndk]
  );

  const updateMuteState = useCallback(
    async (updater: (current: MuteListState) => MuteListState): Promise<boolean> => {
      if (!user) return false;

      try {
        const nextState = updater({
          blockedPubkeys: new Set(blockedPubkeys),
          mutedTags: new Set(mutedTags),
          mutedEventIds: new Set(mutedEventIds),
        });
        await publishMutedList(nextState);
        setMuteState(nextState);
        return true;
      } catch (error) {
        logger.error("Failed to update global mute list", error);
        return false;
      }
    },
    [blockedPubkeys, mutedEventIds, mutedTags, publishMutedList, user]
  );

  const blockUser = useCallback(
    async (pubkey: string): Promise<boolean> => {
      const trimmedPubkey = pubkey.trim();
      if (!trimmedPubkey || blockedPubkeys.has(trimmedPubkey)) return false;

      return updateMuteState((current) => {
        current.blockedPubkeys.add(trimmedPubkey);
        return current;
      });
    },
    [blockedPubkeys, updateMuteState]
  );

  const unblockUser = useCallback(
    async (pubkey: string): Promise<boolean> => {
      const trimmedPubkey = pubkey.trim();
      if (!trimmedPubkey || !blockedPubkeys.has(trimmedPubkey)) return false;

      return updateMuteState((current) => {
        current.blockedPubkeys.delete(trimmedPubkey);
        return current;
      });
    },
    [blockedPubkeys, updateMuteState]
  );

  const muteTag = useCallback(
    async (tag: string): Promise<boolean> => {
      const normalizedTag = normalizeTag(tag);
      if (!normalizedTag || mutedTags.has(normalizedTag)) return false;

      return updateMuteState((current) => {
        current.mutedTags.add(normalizedTag);
        return current;
      });
    },
    [mutedTags, updateMuteState]
  );

  const unmuteTag = useCallback(
    async (tag: string): Promise<boolean> => {
      const normalizedTag = normalizeTag(tag);
      if (!normalizedTag || !mutedTags.has(normalizedTag)) return false;

      return updateMuteState((current) => {
        current.mutedTags.delete(normalizedTag);
        return current;
      });
    },
    [mutedTags, updateMuteState]
  );

  const muteEvent = useCallback(
    async (eventId: string): Promise<boolean> => {
      const trimmedEventId = eventId.trim();
      if (!trimmedEventId || mutedEventIds.has(trimmedEventId)) return false;

      return updateMuteState((current) => {
        current.mutedEventIds.add(trimmedEventId);
        return current;
      });
    },
    [mutedEventIds, updateMuteState]
  );

  const unmuteEvent = useCallback(
    async (eventId: string): Promise<boolean> => {
      const trimmedEventId = eventId.trim();
      if (!trimmedEventId || !mutedEventIds.has(trimmedEventId)) return false;

      return updateMuteState((current) => {
        current.mutedEventIds.delete(trimmedEventId);
        return current;
      });
    },
    [mutedEventIds, updateMuteState]
  );

  const isBlocked = useCallback(
    (pubkey: string): boolean => {
      return blockedPubkeys.has(pubkey);
    },
    [blockedPubkeys]
  );

  const isTagMuted = useCallback(
    (tag: string): boolean => {
      const normalizedTag = normalizeTag(tag);
      return Boolean(normalizedTag) && mutedTags.has(normalizedTag);
    },
    [mutedTags]
  );

  const isEventIdMuted = useCallback(
    (eventId: string): boolean => {
      return mutedEventIds.has(eventId);
    },
    [mutedEventIds]
  );

  const isEventMuted = useCallback(
    (event: NDKEvent): boolean => {
      if (blockedPubkeys.has(event.pubkey)) return true;
      if (mutedEventIds.has(event.id)) return true;
      const hashtags = extractEventHashtags(event);
      return hashtags.some((tag) => mutedTags.has(tag));
    },
    [blockedPubkeys, mutedEventIds, mutedTags]
  );

  const mutedUsers = useMemo(() => sortValues(blockedPubkeys), [blockedPubkeys]);
  const mutedHashtags = useMemo(() => sortValues(mutedTags), [mutedTags]);
  const mutedEvents = useMemo(() => sortValues(mutedEventIds), [mutedEventIds]);

  return {
    blockedPubkeys,
    mutedTags,
    mutedEventIds,
    mutedUsers,
    mutedHashtags,
    mutedEvents,
    isBlocked,
    isTagMuted,
    isEventIdMuted,
    isEventMuted,
    blockUser,
    unblockUser,
    muteTag,
    unmuteTag,
    muteEvent,
    unmuteEvent,
    isLoading,
    blockedCount: blockedPubkeys.size,
    mutedTagCount: mutedTags.size,
    mutedEventCount: mutedEventIds.size,
    mutedCount: blockedPubkeys.size + mutedTags.size + mutedEventIds.size,
  };
}
