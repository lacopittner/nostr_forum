import { useState, useCallback } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useNostr } from "../providers/NostrProvider";

interface ZapReceipt {
  amount: number;
  senderPubkey?: string;
  receiverPubkey: string;
  eventId?: string;
  comment?: string;
}

export function useZaps() {
  const { ndk, user } = useNostr();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get Lightning address from profile
  const getLightningAddress = useCallback(async (pubkey: string): Promise<string | null> => {
    try {
      const profile = await ndk.getUser({ pubkey }).fetchProfile();
      return profile?.lud16 || profile?.lud06 || null;
    } catch (e) {
      return null;
    }
  }, [ndk]);

  // Fetch zap receipts for an event
  const fetchZapReceipts = useCallback(async (eventId: string): Promise<ZapReceipt[]> => {
    try {
      const sub = ndk.subscribe(
        {
          kinds: [9735], // Zap receipt
          "#e": [eventId]
        },
        { closeOnEose: true }
      );

      const receipts: ZapReceipt[] = [];

      sub.on("event", (event: NDKEvent) => {
        const bolt11 = event.tags.find(t => t[0] === "bolt11")?.[1];
        const description = event.tags.find(t => t[0] === "description")?.[1];
        const receiver = event.tags.find(t => t[0] === "p")?.[1];

        if (bolt11) {
          // Parse amount from bolt11 invoice
          const amountMatch = bolt11.match(/lnbc(\d+)/);
          const amount = amountMatch ? parseInt(amountMatch[1]) * 10 : 0; // Convert to sats

          receipts.push({
            amount,
            senderPubkey: description ? JSON.parse(description)?.pubkey : undefined,
            receiverPubkey: receiver || "",
            eventId
          });
        }
      });

      return new Promise((resolve) => {
        sub.on("eose", () => resolve(receipts));
        setTimeout(() => resolve(receipts), 5000); // Timeout after 5s
      });
    } catch (e) {
      return [];
    }
  }, [ndk]);

  // Send a zap
  const sendZap = useCallback(async (
    recipientPubkey: string,
    amount: number, // in sats
    eventId?: string,
    comment?: string
  ): Promise<boolean> => {
    if (!user) return false;

    setIsLoading(true);
    setError(null);

    try {
      const lnAddress = await getLightningAddress(recipientPubkey);
      
      if (!lnAddress) {
        setError("User has no Lightning address configured");
        return false;
      }

      // Create zap request event (kind 9734)
      const zapRequest = new NDKEvent(ndk);
      zapRequest.kind = 9734;
      zapRequest.content = comment || "";
      zapRequest.tags = [
        ["p", recipientPubkey],
        ["amount", (amount * 1000).toString()], // amount in millisats
        ["relays", Array.from(ndk.pool.relays.keys()).join(",")]
      ];

      if (eventId) {
        zapRequest.tags.push(["e", eventId]);
      }

      await zapRequest.sign();

      // For now, we'll open the Lightning invoice in a new window
      // In a real implementation, you'd:
      // 1. Call the LNURL service to get an invoice
      // 2. Show QR code or open wallet
      // 3. Wait for payment confirmation
      
      // Simple approach: open lightning: URI or LN address
      if (lnAddress.includes("@")) {
        // It's a lightning address (user@domain.com)
        const [name, domain] = lnAddress.split("@");
        window.open(`https://${domain}/.well-known/lnurlp/${name}`, "_blank");
      } else {
        // It's an LNURL
        window.open(`lightning:${lnAddress}`, "_blank");
      }

      return true;
    } catch (e) {
      setError("Failed to send zap");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [ndk, user, getLightningAddress]);

  // Fetch total zap amount for an event
  const getTotalZaps = useCallback(async (eventId: string): Promise<number> => {
    const receipts = await fetchZapReceipts(eventId);
    return receipts.reduce((acc, r) => acc + r.amount, 0);
  }, [fetchZapReceipts]);

  return {
    sendZap,
    fetchZapReceipts,
    getTotalZaps,
    getLightningAddress,
    isLoading,
    error
  };
}
