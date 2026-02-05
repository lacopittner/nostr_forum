import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import NDK, { NDKUser, NDKRelay, NDKNip07Signer } from "@nostr-dev-kit/ndk";
import { ndk } from "../lib/ndk";

interface NostrContextType {
  ndk: NDK;
  user: NDKUser | undefined;
  login: () => Promise<void>;
  logout: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  reconnect: () => Promise<void>;
}

const NostrContext = createContext<NostrContextType | undefined>(undefined);

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

export const NostrProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<NDKUser | undefined>(undefined);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") as "light" | "dark" || "light";
    }
    return "light";
  });
  
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const hasAttemptedLogin = useRef(false);

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Connection monitoring
  useEffect(() => {
    let cleanupFns: (() => void)[] = [];

    const handleConnect = () => {
      console.log("Connected to Nostr relay");
      setConnectionStatus("connected");
      reconnectAttempts.current = 0;
    };

    const handleDisconnect = () => {
      console.log("Disconnected from Nostr relay");
      setConnectionStatus("disconnected");
      attemptReconnect();
    };

    const handleError = () => {
      console.error("Relay connection error");
      setConnectionStatus("error");
      attemptReconnect();
    };

    // Monitor relay connections
    const monitorRelays = () => {
      // Clean up old listeners
      cleanupFns.forEach(fn => fn());
      cleanupFns = [];

      const relays = Array.from(ndk.pool.relays.values());
      
      if (relays.length === 0) {
        // No relays configured, set to error
        setConnectionStatus("error");
        return;
      }

      relays.forEach((relay: NDKRelay) => {
        relay.on("connect", handleConnect);
        relay.on("disconnect", handleDisconnect);
        relay.on("flapping", handleError);
        
        // Check if already connected
        if (relay.status === 1) { // 1 = CONNECTED
          handleConnect();
        }
        
        cleanupFns.push(() => {
          relay.off("connect", handleConnect);
          relay.off("disconnect", handleDisconnect);
          relay.off("flapping", handleError);
        });
      });
    };

    // Initial connection
    const connect = async () => {
      try {
        setConnectionStatus("connecting");
        await ndk.connect();
        monitorRelays();
        
        // Auto-login if we have a signer with a key (for the dev identity)
        if (ndk.signer && !hasAttemptedLogin.current) {
          hasAttemptedLogin.current = true;
          // Check if it's a private key signer (dev mode)
          try {
            const user = await ndk.signer.user();
            if (user) {
              await doLogin(user);
            }
          } catch {
            // Not a private key signer, ignore
          }
        }
      } catch (err) {
        console.error("Failed to connect to Nostr relays", err);
        setConnectionStatus("error");
        attemptReconnect();
      }
    };

    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      cleanupFns.forEach(fn => fn());
    };
  }, []);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error("Max reconnect attempts reached");
      setConnectionStatus("error");
      return;
    }

    reconnectAttempts.current++;
    console.log(`Reconnecting... attempt ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS}`);

    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }

    reconnectTimer.current = setTimeout(() => {
      ndk.connect().catch(() => {
        // Error handled by error listener
      });
    }, RECONNECT_DELAY * reconnectAttempts.current);
  }, []);

  const reconnect = async () => {
    reconnectAttempts.current = 0;
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
      }
    } catch (error) {
      console.error("Login failed", error);
      alert("Login failed. Please make sure your Nostr extension is unlocked and try again.");
    }
  };

  const logout = () => {
    setUser(undefined);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  return (
    <NostrContext.Provider value={{ ndk, user, login, logout, theme, toggleTheme, connectionStatus, reconnect }}>
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
