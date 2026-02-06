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
const LEGACY_STORAGE_KEY = "theme";
const DEFAULT_MODE: ThemeMode = "system";
const DEFAULT_ACCENT: AccentColorKey = "orange";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function isAccentColorKey(value: unknown): value is AccentColorKey {
  return typeof value === "string" && value in ACCENT_COLORS;
}

function generateColors(accent: string): ThemeColors {
  const colorDef = ACCENT_COLORS[accent as AccentColorKey] || ACCENT_COLORS.orange;
  return {
    primary: `hsl(${colorDef.hue} 85% 50%)`,
    primaryForeground: "white",
  };
}

function readStoredTheme(): { mode: ThemeMode; accentColor: AccentColorKey } {
  if (typeof window === "undefined") {
    return { mode: DEFAULT_MODE, accentColor: DEFAULT_ACCENT };
  }

  let mode: ThemeMode = DEFAULT_MODE;
  let accentColor: AccentColorKey = DEFAULT_ACCENT;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (isThemeMode(parsed?.mode)) {
        mode = parsed.mode;
      }
      if (isAccentColorKey(parsed?.accentColor)) {
        accentColor = parsed.accentColor;
      }
      return { mode, accentColor };
    }
  } catch {
    // Fallback to legacy storage below
  }

  const legacyMode = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyMode === "light" || legacyMode === "dark") {
    mode = legacyMode;
  }

  return { mode, accentColor };
}

function resolveEffectiveMode(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeState>(() => {
    const stored = readStoredTheme();
    return {
      mode: stored.mode,
      accentColor: stored.accentColor,
      colors: generateColors(stored.accentColor),
    };
  });

  const applyTheme = useCallback((newTheme: ThemeState) => {
    const root = document.documentElement;
    
    // Apply mode
    root.classList.remove("light", "dark");
    
    const effectiveMode = resolveEffectiveMode(newTheme.mode);
    root.classList.add(effectiveMode);
    localStorage.setItem(LEGACY_STORAGE_KEY, effectiveMode);

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
    const payload = {
      mode: theme.mode,
      accentColor: theme.accentColor,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent("nostr-theme-changed", { detail: payload }));
  }, [theme, applyTheme]);

  // Keep multiple hook instances in sync (e.g., app shell + modal)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromStorage = () => {
      const stored = readStoredTheme();
      setThemeState((prev) => {
        if (prev.mode === stored.mode && prev.accentColor === stored.accentColor) {
          return prev;
        }
        return {
          mode: stored.mode,
          accentColor: stored.accentColor,
          colors: generateColors(stored.accentColor),
        };
      });
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY && event.key !== LEGACY_STORAGE_KEY) return;
      syncFromStorage();
    };

    const handleThemeChanged = () => {
      syncFromStorage();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("nostr-theme-changed", handleThemeChanged as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("nostr-theme-changed", handleThemeChanged as EventListener);
    };
  }, []);

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
