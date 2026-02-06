import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import NDK, { NDKUser, NDKRelay, NDKNip07Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { ndk } from "../lib/ndk";
import { hasEncryptedNsec, getEncryptedNsec, decryptNsec, clearEncryptedNsec } from "../lib/crypto";
import { PinUnlockModal } from "../components/PinUnlockModal";

interface NostrContextType {
  ndk: NDK;
  user: NDKUser | undefined;
  login: () => Promise<void>;
  loginWith_nsec: (nsec: string) => Promise<boolean>;
  logout: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  reconnect: () => Promise<void>;
}

const NostrContext = createContext<NostrContextType | undefined>(undefined);
const THEME_STORAGE_KEY = "nostr-reddit-theme";

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
  
  // PIN unlock state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState("");

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

  // Check for encrypted nsec on mount
  useEffect(() => {
    const checkStoredKey = async () => {
      if (hasEncryptedNsec()) {
        setShowPinModal(true);
      }
    };
    
    checkStoredKey();
  }, []);

  // Handle PIN unlock
  const handlePinUnlock = async (pin: string) => {
    const encrypted = getEncryptedNsec();
    if (!encrypted) return;
    
    const nsec = await decryptNsec(encrypted, pin);
    if (nsec) {
      const success = await loginWith_nsec(nsec);
      if (success) {
        setShowPinModal(false);
        setPinError("");
      } else {
        setPinError("Failed to unlock. Please try again.");
      }
    } else {
      setPinError("Invalid PIN. Please try again.");
    }
  };

  // Connection monitoring - simplified
  useEffect(() => {
    setConnectionStatus("connecting");
    
    // Give it 5 seconds to connect before showing error
    const timeout = setTimeout(() => {
      const relays = Array.from(ndk.pool.relays.values());
      const hasConnectedRelay = relays.some((r: NDKRelay) => r.status === 1);
      
      if (!hasConnectedRelay) {
        setConnectionStatus("error");
      }
    }, 5000);

    // Monitor connections
    const checkConnection = () => {
      const relays = Array.from(ndk.pool.relays.values());
      const hasConnectedRelay = relays.some((r: NDKRelay) => r.status === 1);
      
      if (hasConnectedRelay) {
        setConnectionStatus("connected");
        clearTimeout(timeout);
      }
    };

    // Check immediately and then periodically
    checkConnection();
    const interval = setInterval(checkConnection, 2000);

    // Initial connection
    ndk.connect().catch(() => {
      // Connection error handled by timeout
    });

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const reconnect = async () => {
    setConnectionStatus("connecting");
    await ndk.connect();
  };

  const doLogin = async (user: NDKUser) => {
    user.ndk = ndk;
    try {
      await user.fetchProfile();
    } catch (e) {
      console.log("Could not fetch profile, using defaults");
    }
    setUser(user);
  };

  const loginWith_nsec = async (nsec: string): Promise<boolean> => {
    try {
      // Create signer from nsec
      const signer = new NDKPrivateKeySigner(nsec);
      
      // Get user
      const user = await signer.user();
      
      if (user) {
        // Update NDK with the new signer
        (ndk as any).signer = signer;
        await doLogin(user);
        
        return true;
      }
    } catch (error) {
      console.error("Login with nsec failed", error);
    }
    return false;
  };

  const login = async () => {
    try {
      // Check if NIP-07 extension is available
      if (!window.nostr) {
        alert("Please install a Nostr extension (like Alby, nos2x, or Flamingo) to login.");
        return;
      }

      // Create NIP-07 signer
      const nip07Signer = new NDKNip07Signer();
      
      // Wait for the signer to be ready
      await nip07Signer.blockUntilReady();
      
      // Get user from signer
      const user = await nip07Signer.user();
      
      if (user) {
        // Update NDK with the new signer
        (ndk as any).signer = nip07Signer;
        await doLogin(user);
        
        // Note: We don't save NIP-07 login to storage as it requires extension
      }
    } catch (error) {
      console.error("Login failed", error);
      alert("Login failed. Please make sure your Nostr extension is unlocked and try again.");
    }
  };

  const logout = () => {
    clearEncryptedNsec();
    setUser(undefined);
  };

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);

    if (typeof window === "undefined") return;

    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(nextTheme);

    let accentColor = "orange";
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.accentColor === "string") {
          accentColor = parsed.accentColor;
        }
      }
    } catch {
      // Keep default accentColor
    }

    const payload = { mode: nextTheme, accentColor };
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem("theme", nextTheme);
    window.dispatchEvent(new CustomEvent("nostr-theme-changed", { detail: payload }));
  };

  return (
    <NostrContext.Provider value={{ ndk, user, login, loginWith_nsec, logout, theme, toggleTheme, connectionStatus, reconnect }}>
      {children}
      <PinUnlockModal
        isOpen={showPinModal}
        onClose={() => {
          setShowPinModal(false);
          clearEncryptedNsec();
        }}
        onUnlock={handlePinUnlock}
        error={pinError}
      />
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
