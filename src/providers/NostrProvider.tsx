import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import NDK, { NDKUser } from "@nostr-dev-kit/ndk";
import { ndk } from "../lib/ndk";

interface NostrContextType {
  ndk: NDK;
  user: NDKUser | undefined;
  login: () => Promise<void>;
  logout: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const NostrContext = createContext<NostrContextType | undefined>(undefined);

export const NostrProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<NDKUser | undefined>(undefined);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") as "light" | "dark" || "light";
    }
    return "light";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    // Basic connection to relays
    ndk.connect().then(() => {
      console.log("Connected to Nostr relays");
      
      // Auto-login if we have a signer with a key (for the dev identity)
      if (ndk.signer) {
        login();
      }
    }).catch((err) => {
      console.error("Failed to connect to Nostr relays", err);
    });
  }, []);

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
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  return (
    <NostrContext.Provider value={{ ndk, user, login, logout, theme, toggleTheme }}>
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
