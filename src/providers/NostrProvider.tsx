import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import NDK, { NDKUser, NDKRelay, NDKRelayStatus, NDKNip07Signer, NDKPrivateKeySigner, NDKNip46Signer } from "@nostr-dev-kit/ndk";
import { ndk } from "../lib/ndk";
import { logger } from "../lib/logger";
import {
  clearEncryptedNsec,
  decryptNsec,
  encryptNsec,
  getEncryptedNsec,
  hasEncryptedNsec,
  saveEncryptedNsec,
} from "../lib/crypto";

interface NostrContextType {
  ndk: NDK;
  user: NDKUser | undefined;
  login: () => Promise<boolean>;
  loginWith_nsec: (nsec: string, pin: string) => Promise<boolean>;
  loginWithNip46: (connectionToken: string) => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  requiresPinUnlock: boolean;
  pinUnlockError: string;
  dismissPinUnlock: () => void;
  logout: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  reconnect: () => Promise<void>;
}

const NostrContext = createContext<NostrContextType | undefined>(undefined);
const THEME_STORAGE_KEY = "nostr-reddit-theme";
const USER_KEYS_STORAGE_KEY = "_nostruserkeys";
const NIP46_SIGNER_PAYLOAD_STORAGE_KEY = "nostr_nip46_signer_payload";
const LEGACY_AUTH_METHOD_KEY = "nostr_auth_method";
const LEGACY_SESSION_NSEC_KEY = "nostr_session_nsec";
const LEGACY_AUTH_PUBKEY_KEY = "nostr_auth_pubkey";
const RELAY_CONNECTING_STATUSES = new Set<NDKRelayStatus>([
  NDKRelayStatus.CONNECTING,
  NDKRelayStatus.RECONNECTING,
  NDKRelayStatus.FLAPPING,
  NDKRelayStatus.AUTH_REQUESTED,
  NDKRelayStatus.AUTHENTICATING,
]);

function relayStatusLabel(status: NDKRelayStatus): string {
  switch (status) {
    case NDKRelayStatus.DISCONNECTING:
      return "disconnecting";
    case NDKRelayStatus.DISCONNECTED:
      return "disconnected";
    case NDKRelayStatus.RECONNECTING:
      return "reconnecting";
    case NDKRelayStatus.FLAPPING:
      return "flapping";
    case NDKRelayStatus.CONNECTING:
      return "connecting";
    case NDKRelayStatus.CONNECTED:
      return "connected";
    case NDKRelayStatus.AUTH_REQUESTED:
      return "auth_requested";
    case NDKRelayStatus.AUTHENTICATING:
      return "authenticating";
    case NDKRelayStatus.AUTHENTICATED:
      return "authenticated";
    default:
      return `unknown(${String(status)})`;
  }
}

function isRelayConnected(relay: NDKRelay): boolean {
  return relay.status === NDKRelayStatus.CONNECTED || relay.status === NDKRelayStatus.AUTHENTICATED;
}

function getRelaySnapshot(relays: NDKRelay[]) {
  return relays.map((relay) => ({
    url: relay.url,
    status: relayStatusLabel(relay.status),
    attempts: relay.connectionStats.attempts,
    success: relay.connectionStats.success,
    nextReconnectAt: relay.connectionStats.nextReconnectAt ?? null,
  }));
}

async function waitForNip07(timeoutMs = 5000, pollMs = 100): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.nostr) return true;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    if (window.nostr) return true;
  }
  return false;
}

type StoredUserKeys = {
  pub?: string;
  sec?: string;
  ext?: boolean;
  encrypted?: boolean;
  nip46?: boolean;
};

function readStoredUserKeys(): StoredUserKeys | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEYS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as StoredUserKeys;
  } catch {
    return null;
  }
}

function saveStoredUserKeys(keys: StoredUserKeys) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEYS_STORAGE_KEY, JSON.stringify(keys));
}

function clearStoredUserKeys() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEYS_STORAGE_KEY);
}

function getStoredNip46SignerPayload(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(NIP46_SIGNER_PAYLOAD_STORAGE_KEY);
}

function saveStoredNip46SignerPayload(payload: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NIP46_SIGNER_PAYLOAD_STORAGE_KEY, payload);
}

function clearStoredNip46SignerPayload() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(NIP46_SIGNER_PAYLOAD_STORAGE_KEY);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";

  const root = window.document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";

  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.mode === "dark" || parsed?.mode === "light") {
        return parsed.mode;
      }
      if (parsed?.mode === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    }
  } catch {
    // Fallback to legacy key below
  }

  const legacyTheme = localStorage.getItem("theme");
  if (legacyTheme === "dark" || legacyTheme === "light") {
    return legacyTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const NostrProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<NDKUser | undefined>(undefined);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);
  const [requiresPinUnlock, setRequiresPinUnlock] = useState(false);
  const [pinUnlockError, setPinUnlockError] = useState("");
  const reconnectAttemptsRef = useRef(0);

  // Keep context theme in sync with global theme manager.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => {
      setTheme(window.document.documentElement.classList.contains("dark") ? "dark" : "light");
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== THEME_STORAGE_KEY && event.key !== "theme") return;
      syncTheme();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("nostr-theme-changed", syncTheme as EventListener);
    syncTheme();

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("nostr-theme-changed", syncTheme as EventListener);
    };
  }, []);

  // Relay connection monitoring with debug logs.
  useEffect(() => {
    setConnectionStatus("connecting");
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const updateConnectionStatus = (
      nextStatus: "connecting" | "connected" | "disconnected" | "error",
      reason: string,
      relays: NDKRelay[]
    ) => {
      setConnectionStatus((prev) => {
        if (prev !== nextStatus) {
          logger.info(`[Nostr] Connection status ${prev} -> ${nextStatus} (${reason})`, {
            relays: getRelaySnapshot(relays),
          });
        }
        return nextStatus;
      });
    };

    const evaluateConnection = (reason: string) => {
      const relays = Array.from(ndk.pool.relays.values());
      const hasConnectedRelay = relays.some(isRelayConnected);
      const hasConnectingRelay = relays.some((relay) => RELAY_CONNECTING_STATUSES.has(relay.status));

      if (hasConnectedRelay) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        updateConnectionStatus("connected", reason, relays);
        return;
      }

      if (timedOut) {
        updateConnectionStatus("error", reason, relays);
        return;
      }

      if (relays.length === 0 || hasConnectingRelay) {
        updateConnectionStatus("connecting", reason, relays);
        return;
      }

      updateConnectionStatus("disconnected", reason, relays);
    };

    logger.info("[Nostr] Starting relay monitor", {
      relays: getRelaySnapshot(Array.from(ndk.pool.relays.values())),
    });

    timeoutId = setTimeout(() => {
      timedOut = true;
      evaluateConnection("timeout");
    }, 5000);

    evaluateConnection("initial-check");
    const interval = setInterval(() => evaluateConnection("poll"), 2000);

    ndk.connect()
      .then(() => {
        logger.info("[Nostr] ndk.connect() resolved");
        evaluateConnection("connect-resolved");
      })
      .catch((error) => {
        logger.error("[Nostr] ndk.connect() failed", error);
      });

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      clearInterval(interval);
    };
  }, []);

  const reconnect = async () => {
    logger.info("[Nostr] Manual reconnect requested", {
      relays: getRelaySnapshot(Array.from(ndk.pool.relays.values())),
    });
    setConnectionStatus("connecting");
    try {
      await ndk.connect();
      logger.info("[Nostr] Manual reconnect finished");
    } catch (error) {
      logger.error("[Nostr] Manual reconnect failed", error);
      setConnectionStatus("error");
    }
  };

  useEffect(() => {
    if (connectionStatus === "connected") {
      reconnectAttemptsRef.current = 0;
      return;
    }

    if (connectionStatus === "connecting") return;

    const nextAttempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = nextAttempt;
    const backoffMs = Math.min(30000, 1500 * 2 ** (nextAttempt - 1));

    logger.warn(`[Nostr] Connection degraded (${connectionStatus}), retrying in ${backoffMs}ms`);

    const timeoutId = setTimeout(() => {
      setConnectionStatus("connecting");
      ndk.connect().catch((error) => {
        logger.error("[Nostr] Auto reconnect attempt failed", error);
      });
    }, backoffMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [connectionStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      logger.info("[Nostr] Browser reported network online, reconnecting relays");
      void reconnect();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [reconnect]);

  const doLogin = useCallback(async (user: NDKUser) => {
    user.ndk = ndk;
    try {
      await user.fetchProfile();
    } catch (error) {
      logger.warn("[Nostr] Could not fetch profile, using defaults", error);
    }
    setUser(user);
  }, []);

  const clearLegacyAuthSession = () => {
    localStorage.removeItem(LEGACY_AUTH_METHOD_KEY);
    localStorage.removeItem(LEGACY_AUTH_PUBKEY_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_NSEC_KEY);
  };

  const stopActiveNip46Signer = useCallback(() => {
    const activeSigner = (ndk as any).signer;
    if (activeSigner instanceof NDKNip46Signer) {
      activeSigner.stop();
    }
  }, []);

  const loginWithNsecInternal = useCallback(async (nsec: string): Promise<string | null> => {
    try {
      const signer = new NDKPrivateKeySigner(nsec);
      const user = await signer.user();
      
      if (user) {
        stopActiveNip46Signer();
        (ndk as any).signer = signer;
        await doLogin(user);
        return user.pubkey;
      }
    } catch (error) {
      logger.error("[Nostr] Login with nsec failed", error);
    }
    return null;
  }, [doLogin, stopActiveNip46Signer]);

  const loginWithNip07Internal = useCallback(async (): Promise<string | null> => {
    const hasNip07 = await waitForNip07();
    if (!hasNip07 || !window.nostr) {
      logger.warn("[Nostr] NIP-07 extension not available");
      return null;
    }
    
    try {
      const nip07Signer = new NDKNip07Signer();
      await nip07Signer.blockUntilReady();
      const user = await nip07Signer.user();

      if (user) {
        stopActiveNip46Signer();
        (ndk as any).signer = nip07Signer;
        await doLogin(user);
        return user.pubkey;
      }
    } catch (error) {
      logger.error("[Nostr] Login with extension failed", error);
    }

    return null;
  }, [doLogin, stopActiveNip46Signer]);

  type Nip46LoginResult = {
    pubkey: string;
    signerPayload: string;
  };

  const loginWithNip46TokenInternal = useCallback(async (connectionToken: string): Promise<Nip46LoginResult | null> => {
    const trimmedToken = connectionToken.trim();
    if (!trimmedToken) return null;

    try {
      const nip46Signer = NDKNip46Signer.bunker(ndk, trimmedToken);
      const user = await withTimeout(
        nip46Signer.blockUntilReady(),
        35000,
        "Nostr Connect authorization timed out. Confirm the request in your signer app."
      );

      const signerPayload = nip46Signer.toPayload();
      stopActiveNip46Signer();
      (ndk as any).signer = nip46Signer;
      await doLogin(user);
      return {
        pubkey: user.pubkey,
        signerPayload,
      };
    } catch (error) {
      logger.error("[Nostr] Login with NIP-46 failed", error);
    }

    return null;
  }, [doLogin, stopActiveNip46Signer]);

  const loginWithNip46PayloadInternal = useCallback(async (payload: string): Promise<Nip46LoginResult | null> => {
    try {
      const nip46Signer = await NDKNip46Signer.fromPayload(payload, ndk);
      const user = await withTimeout(
        nip46Signer.blockUntilReady(),
        15000,
        "Timed out while restoring Nostr Connect session."
      );

      const signerPayload = nip46Signer.toPayload();
      stopActiveNip46Signer();
      (ndk as any).signer = nip46Signer;
      await doLogin(user);
      return {
        pubkey: user.pubkey,
        signerPayload,
      };
    } catch (error) {
      logger.error("[Nostr] Failed to restore NIP-46 session", error);
    }

    return null;
  }, [doLogin, stopActiveNip46Signer]);

  const dismissPinUnlock = useCallback(() => {
    setRequiresPinUnlock(false);
    setPinUnlockError("");
  }, []);

  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    const encryptedNsec = getEncryptedNsec();
    if (!encryptedNsec) {
      setPinUnlockError("No encrypted key found. Please login with your private key.");
      setRequiresPinUnlock(false);
      clearStoredUserKeys();
      return false;
    }

    const nsec = await decryptNsec(encryptedNsec, pin);
    if (!nsec) {
      setPinUnlockError("Invalid PIN. Please try again.");
      return false;
    }

    const pubkey = await loginWithNsecInternal(nsec);
    if (!pubkey) {
      setPinUnlockError("Failed to unlock key. Please login again with your private key.");
      return false;
    }

    saveStoredUserKeys({
      pub: pubkey,
      encrypted: true,
    });
    clearStoredNip46SignerPayload();
    setPinUnlockError("");
    setRequiresPinUnlock(false);
    clearLegacyAuthSession();
    return true;
  }, [loginWithNsecInternal]);

  // Restore auth session on refresh.
  useEffect(() => {
    let isActive = true;

    const restoreSession = async () => {
      const storedKeys = readStoredUserKeys();
      logger.info("[Nostr] Restoring session", {
        hasStoredNsec: Boolean(storedKeys?.sec),
        hasStoredExt: Boolean(storedKeys?.ext),
        hasStoredNip46: Boolean(storedKeys?.nip46),
        hasStoredNip46Payload: Boolean(getStoredNip46SignerPayload()),
        hasStoredEncryptedNsec: hasEncryptedNsec(),
      });

      if (storedKeys?.nip46) {
        const signerPayload = getStoredNip46SignerPayload();
        if (!signerPayload) {
          logger.warn("[Nostr] Missing NIP-46 signer payload, clearing stored keys");
          clearStoredUserKeys();
          setUser(undefined);
          return;
        }

        const restoredSession = await loginWithNip46PayloadInternal(signerPayload);
        if (!isActive) return;

        if (restoredSession) {
          saveStoredNip46SignerPayload(restoredSession.signerPayload);
          if (storedKeys.pub !== restoredSession.pubkey) {
            saveStoredUserKeys({
              pub: restoredSession.pubkey,
              nip46: true,
            });
          }
          return;
        }

        logger.warn("[Nostr] Failed to restore NIP-46 session, keeping stored session for next retry");
        setUser(undefined);
        return;
      }

      if (storedKeys?.ext) {
        const hasNip07 = await waitForNip07(7000);
        if (!isActive) return;

        if (!hasNip07) {
          logger.warn("[Nostr] NIP-07 extension not detected during restore, keeping stored extension session");
          setUser(undefined);
          return;
        }

        const restoredPubkey = await loginWithNip07Internal();
        if (!isActive) return;

        if (restoredPubkey) {
          if (storedKeys.pub !== restoredPubkey) {
            saveStoredUserKeys({
              pub: restoredPubkey,
              ext: true,
            });
          }
          return;
        }

        logger.warn("[Nostr] Failed to restore extension session, keeping stored extension session for next retry");
        setUser(undefined);
        return;
      }

      if ((storedKeys?.encrypted || (!storedKeys?.sec && !storedKeys?.ext && !storedKeys?.nip46)) && hasEncryptedNsec()) {
        setRequiresPinUnlock(true);
        setPinUnlockError("");
        setUser(undefined);
        return;
      }

      if (storedKeys?.sec) {
        // Security migration: stop restoring plaintext nsec sessions.
        logger.warn("[Nostr] Found legacy plaintext nsec session; clearing stored keys");
        clearStoredUserKeys();
        setUser(undefined);
        return;
      }

      setUser(undefined);
    };

    void restoreSession();

    return () => {
      isActive = false;
    };
  }, [loginWithNsecInternal, loginWithNip07Internal, loginWithNip46PayloadInternal]);

  const loginWith_nsec = async (nsec: string, pin: string): Promise<boolean> => {
    try {
      setPinUnlockError("");
      const pubkey = await loginWithNsecInternal(nsec);
      if (pubkey) {
        const encryptedNsec = await encryptNsec(nsec, pin);
        saveEncryptedNsec(encryptedNsec);
        saveStoredUserKeys({
          pub: pubkey,
          encrypted: true,
        });
        clearStoredNip46SignerPayload();
        setRequiresPinUnlock(false);
        clearLegacyAuthSession();
        return true;
      }
    } catch (error) {
      logger.error("[Nostr] Failed to encrypt and store nsec", error);
      (ndk as any).signer = undefined;
      setUser(undefined);
      return false;
    }
    return false;
  };

  const login = async (): Promise<boolean> => {
    try {
      // Wait a bit for extension injection to avoid refresh race conditions.
      const hasNip07 = await waitForNip07(5000);
      if (!hasNip07 || !window.nostr) {
        alert("Please install a Nostr extension (like Alby, nos2x, or Flamingo) to login.");
        return false;
      }

      const pubkey = await loginWithNip07Internal();
      if (pubkey) {
        clearEncryptedNsec();
        clearStoredNip46SignerPayload();
        setRequiresPinUnlock(false);
        setPinUnlockError("");
        saveStoredUserKeys({
          pub: pubkey,
          ext: true,
        });
        clearLegacyAuthSession();
        return true;
      }
    } catch (error) {
      logger.error("[Nostr] Login failed", error);
      alert("Login failed. Please make sure your Nostr extension is unlocked and try again.");
    }
    return false;
  };

  const loginWithNip46 = async (connectionToken: string): Promise<boolean> => {
    setPinUnlockError("");
    setRequiresPinUnlock(false);

    const loginResult = await loginWithNip46TokenInternal(connectionToken);
    if (!loginResult) return false;

    clearEncryptedNsec();
    saveStoredNip46SignerPayload(loginResult.signerPayload);
    saveStoredUserKeys({
      pub: loginResult.pubkey,
      nip46: true,
    });
    clearLegacyAuthSession();
    return true;
  };

  const logout = () => {
    stopActiveNip46Signer();
    clearStoredUserKeys();
    clearEncryptedNsec();
    clearStoredNip46SignerPayload();
    clearLegacyAuthSession();
    (ndk as any).signer = undefined;
    setUser(undefined);
    setRequiresPinUnlock(false);
    setPinUnlockError("");
  };

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);

    if (typeof window === "undefined") return;

    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(nextTheme);

    let accentColor = "orange";
    let surfaceTheme = "default";
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.accentColor === "string") {
          accentColor = parsed.accentColor;
        }
        if (typeof parsed?.surfaceTheme === "string") {
          surfaceTheme = parsed.surfaceTheme;
        }
      }
    } catch {
      // Keep default accentColor
    }

    const payload = { mode: nextTheme, accentColor, surfaceTheme };
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem("theme", nextTheme);
    window.dispatchEvent(new CustomEvent("nostr-theme-changed", { detail: payload }));
  };

  return (
    <NostrContext.Provider
      value={{
        ndk,
        user,
        login,
        loginWith_nsec,
        loginWithNip46,
        unlockWithPin,
        requiresPinUnlock,
        pinUnlockError,
        dismissPinUnlock,
        logout,
        theme,
        toggleTheme,
        connectionStatus,
        reconnect,
      }}
    >
      {children}
    </NostrContext.Provider>
  );
};

export const useNostr = () => {
  const context = useContext(NostrContext);
  if (context === undefined) {
    throw new Error("useNostr must be used within a NostrProvider");
  }
  return context;
};
