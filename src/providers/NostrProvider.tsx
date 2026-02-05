import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import NDK, { NDKUser, NDKRelay } from "@nostr-dev-kit/ndk";
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

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Connection monitoring
  useEffect(() => {
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

    const handleError = (err: Error) => {
      console.error("Relay error:", err);
      setConnectionStatus("error");
      attemptReconnect();
    };

    // Monitor relay connections
    const monitorRelays = () => {
      const relays = Array.from(ndk.pool.relays.values());
      relays.forEach((relay: NDKRelay) => {
        relay.on("connect", handleConnect);
        relay.on("disconnect", handleDisconnect);
        relay.on("error", handleError);
      });

      return () => {
        relays.forEach((relay: NDKRelay) => {
          relay.off("connect", handleConnect);
          relay.off("disconnect", handleDisconnect);
          relay.off("error", handleError);
        });
      };
    };

    // Initial connection
    const connect = async () => {
      try {
        setConnectionStatus("connecting");
        await ndk.connect();
        
        // Auto-login if we have a signer with a key (for the dev identity)
        if (ndk.signer) {
          await login();
        }
        
        monitorRelays();
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
    };
  }, []);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error("Max reconnect attempts reached");
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

  const login = async () => {
    try {
      // NIP-07 login
      const signer = ndk.signer;
      if (signer) {
        const user = await signer.user();
        if (user) {
          user.ndk = ndk;
          await user.fetchProfile();
          setUser(user);
        }
      } else {
        alert("Please install a Nostr extension (like Alby) to login.");
      }
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const logout = () => {
    setUser(undefined);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "dark" ? "light" : "light");
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
