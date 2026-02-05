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

export const NostrProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<NDKUser | undefined>(undefined);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") as "light" | "dark" || "light";
    }
    return "light";
  });
  
  // PIN unlock state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState("");

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

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
    setTheme(prev => prev === "light" ? "dark" : "light");
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
