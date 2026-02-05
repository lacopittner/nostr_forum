import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import NDK, { NDKUser, NDKRelay, NDKNip07Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { ndk } from "../lib/ndk";

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

const LOGIN_STORAGE_KEY = "nostr_reddit_login";

export const NostrProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<NDKUser | undefined>(undefined);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") as "light" | "dark" || "light";
    }
    return "light";
  });

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Check for saved login on mount
  useEffect(() => {
    const savedLogin = localStorage.getItem(LOGIN_STORAGE_KEY);
    if (savedLogin) {
      try {
        const { type, key } = JSON.parse(savedLogin);
        if (type === "nsec") {
          loginWith_nsec(key, false);
        }
      } catch {
        console.log("Failed to restore login");
      }
    }
  }, []);

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

  const loginWith_nsec = async (nsec: string, saveToStorage = true): Promise<boolean> => {
    try {
      // Create signer from nsec
      const signer = new NDKPrivateKeySigner(nsec);
      
      // Get user
      const user = await signer.user();
      
      if (user) {
        // Update NDK with the new signer
        (ndk as any).signer = signer;
        await doLogin(user);
        
        // Save to localStorage for persistence
        if (saveToStorage) {
          localStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify({ type: "nsec", key: nsec }));
        }
        
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
    localStorage.removeItem(LOGIN_STORAGE_KEY);
    setUser(undefined);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  return (
    <NostrContext.Provider value={{ ndk, user, login, loginWith_nsec, logout, theme, toggleTheme, connectionStatus, reconnect }}>
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
