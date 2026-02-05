import { useState, useCallback } from "react";
import { logger } from "../lib/logger";

interface Nip05Verification {
  nip05: string;
  isVerified: boolean;
  isLoading: boolean;
}

export function useNip05() {
  const [verification, setVerification] = useState<Nip05Verification | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const verifyNip05 = useCallback(async (nip05: string, expectedPubkey: string): Promise<boolean> => {
    if (!nip05.includes("@")) return false;

    try {
      const [name, domain] = nip05.split("@");
      if (!name || !domain) return false;

      // Fetch well-known endpoint
      const response = await fetch(`https://${domain}/.well-known/nostr.json?name=${name}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) return false;

      const data = await response.json();
      
      // Check if pubkey matches
      const foundPubkey = data.names?.[name];
      if (foundPubkey && foundPubkey.toLowerCase() === expectedPubkey.toLowerCase()) {
        return true;
      }

      return false;
    } catch (error) {
      logger.error("NIP-05 verification failed:", error);
      return false;
    }
  }, []);

  const checkProfileNip05 = useCallback(async (profileNip05: string, userPubkey: string) => {
    setIsLoading(true);
    setVerification({ nip05: profileNip05, isVerified: false, isLoading: true });

    const isVerified = await verifyNip05(profileNip05, userPubkey);

    setVerification({
      nip05: profileNip05,
      isVerified,
      isLoading: false,
    });

    setIsLoading(false);
    return isVerified;
  }, [verifyNip05]);

  return {
    verification,
    isLoading,
    verifyNip05,
    checkProfileNip05,
  };
}
