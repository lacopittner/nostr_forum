import { useState, useEffect, useCallback } from "react";

type ThemeMode = "light" | "dark" | "system";

interface ThemeColors {
  primary: string;
  primaryForeground: string;
}

export interface ThemeState {
  mode: ThemeMode;
  accentColor: string;
  colors: ThemeColors;
}

export const ACCENT_COLORS = {
  orange: { hue: 24, name: "Orange" },
  blue: { hue: 217, name: "Blue" },
  green: { hue: 142, name: "Green" },
  purple: { hue: 270, name: "Purple" },
  pink: { hue: 330, name: "Pink" },
  red: { hue: 0, name: "Red" },
  teal: { hue: 175, name: "Teal" },
  yellow: { hue: 45, name: "Yellow" },
};

type AccentColorKey = keyof typeof ACCENT_COLORS;

const STORAGE_KEY = "nostr-reddit-theme";

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeState>(() => {
    if (typeof window === "undefined") {
      return {
        mode: "system",
        accentColor: "orange",
        colors: { primary: "hsl(24 95% 53%)", primaryForeground: "white" },
      };
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          mode: parsed.mode || "system",
          accentColor: parsed.accentColor || "orange",
          colors: generateColors(parsed.accentColor || "orange"),
        };
      } catch {
        // fallback
      }
    }

    return {
      mode: "system",
      accentColor: "orange",
      colors: generateColors("orange"),
    };
  });

  function generateColors(accent: string): ThemeColors {
    const colorDef = ACCENT_COLORS[accent as AccentColorKey] || ACCENT_COLORS.orange;
    return {
      primary: `hsl(${colorDef.hue} 85% 50%)`,
      primaryForeground: "white",
    };
  }

  const applyTheme = useCallback((newTheme: ThemeState) => {
    const root = document.documentElement;
    
    // Apply mode
    root.classList.remove("light", "dark");
    
    let effectiveMode = newTheme.mode;
    if (effectiveMode === "system") {
      effectiveMode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    root.classList.add(effectiveMode);

    // Apply accent color
    const colorDef = ACCENT_COLORS[newTheme.accentColor as AccentColorKey] || ACCENT_COLORS.orange;
    const hue = colorDef.hue;
    
    root.style.setProperty("--primary-hue", hue.toString());
    root.style.setProperty("--primary", `hsl(${hue} 85% 50%)`);
    root.style.setProperty("--primary-foreground", "white");
    root.style.setProperty("--primary-hover", `hsl(${hue} 85% 45%)`);
    root.style.setProperty("--primary-light", `hsl(${hue} 85% 95%)`);
    root.style.setProperty("--primary-dark", `hsl(${hue} 85% 35%)`);
    root.style.setProperty("--ring", `hsl(${hue} 85% 50%)`);
    
    // Update CSS variables for accent
    root.style.setProperty("--accent", `hsl(${hue} 85% 50%)`);
    root.style.setProperty("--accent-foreground", "white");
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: theme.mode,
      accentColor: theme.accentColor,
    }));
  }, [theme, applyTheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme.mode !== "system") return;
    
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(theme);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme, applyTheme]);

  const setMode = useCallback((mode: ThemeMode) => {
    setThemeState(prev => ({ ...prev, mode }));
  }, []);

  const setAccentColor = useCallback((accentColor: string) => {
    setThemeState(prev => ({
      ...prev,
      accentColor,
      colors: generateColors(accentColor),
    }));
  }, []);

  return {
    mode: theme.mode,
    accentColor: theme.accentColor,
    colors: theme.colors,
    accentColors: ACCENT_COLORS as typeof ACCENT_COLORS,
    setMode,
    setAccentColor,
  };
}
