import { useState, useCallback } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useNostr } from "../providers/NostrProvider";
import { LightningAddress } from "@getalby/lightning-tools/lnurl";

interface ZapReceipt {
  amount: number;
  senderPubkey?: string;
  receiverPubkey: string;
  eventId?: string;
  comment?: string;
}

interface SendZapResult {
  success: boolean;
  paymentUri?: string;
  warning?: string;
}

export function useZaps() {
  const { ndk, user, requireSigner } = useNostr();
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
  ): Promise<SendZapResult> => {
    if (!user) return { success: false };

    setIsLoading(true);
    setError(null);

    try {
      const lnAddress = await getLightningAddress(recipientPubkey);
      
      if (!lnAddress) {
        setError("User has no Lightning address configured");
        return { success: false };
      }

      const normalizedLnAddress = lnAddress.trim();

      // Build a QR payload wallets can reliably scan.
      // Prefer a real BOLT11 invoice for lightning addresses.
      let paymentUri: string;
      let fallbackWarning: string | undefined;

      if (normalizedLnAddress.includes("@")) {
        try {
          const ln = new LightningAddress(normalizedLnAddress);
          await ln.fetch();
          const invoice = await ln.requestInvoice({
            satoshi: amount,
            comment: comment || undefined,
          });
          paymentUri = invoice.paymentRequest;
        } catch {
          paymentUri = normalizedLnAddress.startsWith("lightning:")
            ? normalizedLnAddress
            : `lightning:${normalizedLnAddress}`;
          fallbackWarning = "Could not fetch invoice from lightning address. Using fallback QR payload.";
        }
      } else {
        paymentUri = normalizedLnAddress.startsWith("lightning:")
          ? normalizedLnAddress
          : normalizedLnAddress;
      }

      try {
        const hasSigner = await requireSigner();
        if (!hasSigner) {
          return {
            success: true,
            paymentUri,
            warning: fallbackWarning || "Signer not available. QR generated as regular Lightning payment.",
          };
        }

        // Create zap request event (kind 9734)
        const zapRequest = new NDKEvent(ndk);
        zapRequest.kind = 9734;
        zapRequest.content = comment || "";
        zapRequest.tags = [
          ["p", recipientPubkey],
          ["amount", (amount * 1000).toString()], // amount in millisats
          ["relays", ...Array.from(ndk.pool.relays.keys())],
        ];

        if (eventId) {
          zapRequest.tags.push(["e", eventId]);
        }

        await zapRequest.sign();

        return {
          success: true,
          paymentUri,
          warning: fallbackWarning,
        };
      } catch {
        return {
          success: true,
          paymentUri,
          warning: fallbackWarning || "Zap request signing failed. QR generated as regular Lightning payment.",
        };
      }
    } catch (e) {
      setError("Failed to send zap");
      return { success: false };
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
