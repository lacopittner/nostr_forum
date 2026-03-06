import { NDKEvent, NDKRelayStatus } from "@nostr-dev-kit/ndk";
import { logger } from "./logger";

const CONNECTED_RELAY_STATUSES = new Set<NDKRelayStatus>([
  NDKRelayStatus.CONNECTED,
  NDKRelayStatus.AUTHENTICATED,
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hasConnectedRelay = (event: NDKEvent): boolean => {
  if (!event.ndk) return false;
  const relays = Array.from(event.ndk.pool.relays.values());
  return relays.some((relay) => CONNECTED_RELAY_STATUSES.has(relay.status));
};

const waitForConnectedRelay = async (event: NDKEvent, timeoutMs: number): Promise<boolean> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (hasConnectedRelay(event)) return true;
    await sleep(250);
  }
  return hasConnectedRelay(event);
};

interface PublishWithFailoverOptions {
  maxAttempts?: number;
  connectTimeoutMs?: number;
}

export async function publishWithRelayFailover(
  event: NDKEvent,
  { maxAttempts = 4, connectTimeoutMs = 6000 }: PublishWithFailoverOptions = {}
): Promise<void> {
  if (!event.ndk) {
    throw new Error("Event must be attached to NDK instance before publishing");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (!hasConnectedRelay(event)) {
        await event.ndk.connect();
        await waitForConnectedRelay(event, connectTimeoutMs);
      }

      await event.publish();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;

      const backoffMs = Math.min(8000, 700 * 2 ** (attempt - 1));
      logger.warn(`[Nostr] Publish attempt ${attempt}/${maxAttempts} failed, retrying in ${backoffMs}ms`, error);
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Publish failed after relay failover retries");
}
