import { useState, useEffect, useCallback } from "react";

type ThemeMode = "light" | "dark" | "system";
type PrimaryTextTone = "light" | "dark";

interface ThemeColors {
  primary: string;
  primaryForeground: string;
}

export interface ThemeState {
  mode: ThemeMode;
  accentColor: string;
  surfaceTheme: string;
  primaryTextTone: PrimaryTextTone;
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

export const SURFACE_THEMES = {
  default: {
    name: "Default",
    description: "Balanced neutral surfaces",
    preview: { light: "hsl(0 0% 100%)", dark: "hsl(220 15% 8%)" },
  },
  amoled: {
    name: "AMOLED",
    description: "Pure black for OLED displays",
    preview: { light: "hsl(0 0% 100%)", dark: "hsl(0 0% 0%)" },
  },
  twitter: {
    name: "Midnight Blue",
    description: "Dark navy inspired by modern social apps",
    preview: { light: "hsl(210 60% 98%)", dark: "hsl(210 32% 13%)" },
  },
  forest: {
    name: "Forest",
    description: "Soft green-tinted surfaces",
    preview: { light: "hsl(150 25% 98%)", dark: "hsl(155 20% 9%)" },
  },
  uniq: {
    name: "Uniq",
    description: "High-contrast retro-futuristic geometry",
    preview: { light: "hsl(48 86% 95%)", dark: "hsl(220 39% 9%)" },
  },
};

type AccentColorKey = keyof typeof ACCENT_COLORS;
type SurfaceThemeKey = keyof typeof SURFACE_THEMES;

const STORAGE_KEY = "nostr-reddit-theme";
const LEGACY_STORAGE_KEY = "theme";
const DEFAULT_MODE: ThemeMode = "system";
const DEFAULT_ACCENT: AccentColorKey = "orange";
const DEFAULT_SURFACE: SurfaceThemeKey = "default";
const DEFAULT_PRIMARY_TEXT_TONE: PrimaryTextTone = "light";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function isAccentColorKey(value: unknown): value is AccentColorKey {
  return typeof value === "string" && value in ACCENT_COLORS;
}

function isSurfaceThemeKey(value: unknown): value is SurfaceThemeKey {
  return typeof value === "string" && value in SURFACE_THEMES;
}

function isPrimaryTextTone(value: unknown): value is PrimaryTextTone {
  return value === "light" || value === "dark";
}

function getSuggestedPrimaryTextTone(accent: AccentColorKey): PrimaryTextTone {
  if (accent === "teal" || accent === "yellow") {
    return "dark";
  }
  return DEFAULT_PRIMARY_TEXT_TONE;
}

function resolvePrimaryForeground(primaryTextTone: PrimaryTextTone): string {
  return primaryTextTone === "dark" ? "hsl(220 30% 12%)" : "hsl(0 0% 100%)";
}

function generateColors(accent: string, primaryTextTone: PrimaryTextTone): ThemeColors {
  const colorDef = ACCENT_COLORS[accent as AccentColorKey] || ACCENT_COLORS.orange;
  return {
    primary: `hsl(${colorDef.hue} 85% 50%)`,
    primaryForeground: resolvePrimaryForeground(primaryTextTone),
  };
}

function readStoredTheme(): {
  mode: ThemeMode;
  accentColor: AccentColorKey;
  surfaceTheme: SurfaceThemeKey;
  primaryTextTone: PrimaryTextTone;
} {
  if (typeof window === "undefined") {
    return {
      mode: DEFAULT_MODE,
      accentColor: DEFAULT_ACCENT,
      surfaceTheme: DEFAULT_SURFACE,
      primaryTextTone: getSuggestedPrimaryTextTone(DEFAULT_ACCENT),
    };
  }

  let mode: ThemeMode = DEFAULT_MODE;
  let accentColor: AccentColorKey = DEFAULT_ACCENT;
  let surfaceTheme: SurfaceThemeKey = DEFAULT_SURFACE;
  let primaryTextTone: PrimaryTextTone = getSuggestedPrimaryTextTone(DEFAULT_ACCENT);

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
      if (isSurfaceThemeKey(parsed?.surfaceTheme)) {
        surfaceTheme = parsed.surfaceTheme;
      }
      if (isPrimaryTextTone(parsed?.primaryTextTone)) {
        primaryTextTone = parsed.primaryTextTone;
      } else {
        primaryTextTone = getSuggestedPrimaryTextTone(accentColor);
      }
      return { mode, accentColor, surfaceTheme, primaryTextTone };
    }
  } catch {
    // Fallback to legacy storage below
  }

  const legacyMode = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyMode === "light" || legacyMode === "dark") {
    mode = legacyMode;
  }

  return { mode, accentColor, surfaceTheme, primaryTextTone };
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
      surfaceTheme: stored.surfaceTheme,
      primaryTextTone: stored.primaryTextTone,
      colors: generateColors(stored.accentColor, stored.primaryTextTone),
    };
  });

  const applyTheme = useCallback((newTheme: ThemeState) => {
    const root = document.documentElement;
    
    // Apply mode
    root.classList.remove("light", "dark");
    
    const effectiveMode = resolveEffectiveMode(newTheme.mode);
    root.classList.add(effectiveMode);
    localStorage.setItem(LEGACY_STORAGE_KEY, effectiveMode);
    root.setAttribute("data-surface-theme", newTheme.surfaceTheme);

    // Apply accent color
    const colorDef = ACCENT_COLORS[newTheme.accentColor as AccentColorKey] || ACCENT_COLORS.orange;
    const hue = colorDef.hue;
    
    root.style.setProperty("--primary-hue", hue.toString());
    root.style.setProperty("--primary", `hsl(${hue} 85% 50%)`);
    root.style.setProperty("--primary-foreground", resolvePrimaryForeground(newTheme.primaryTextTone));
    root.style.setProperty("--primary-hover", `hsl(${hue} 85% 45%)`);
    root.style.setProperty("--primary-light", `hsl(${hue} 85% 95%)`);
    root.style.setProperty("--primary-dark", `hsl(${hue} 85% 35%)`);
    root.style.setProperty("--ring", `hsl(${hue} 85% 50%)`);
    
    // Update CSS variables for accent
    root.style.setProperty("--accent", `hsl(${hue} 85% 50%)`);
    root.style.setProperty("--accent-foreground", resolvePrimaryForeground(newTheme.primaryTextTone));
  }, []);

  useEffect(() => {
    applyTheme(theme);
    const payload = {
      mode: theme.mode,
      accentColor: theme.accentColor,
      surfaceTheme: theme.surfaceTheme,
      primaryTextTone: theme.primaryTextTone,
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
        if (
          prev.mode === stored.mode &&
          prev.accentColor === stored.accentColor &&
          prev.surfaceTheme === stored.surfaceTheme &&
          prev.primaryTextTone === stored.primaryTextTone
        ) {
          return prev;
        }
        return {
          mode: stored.mode,
          accentColor: stored.accentColor,
          surfaceTheme: stored.surfaceTheme,
          primaryTextTone: stored.primaryTextTone,
          colors: generateColors(stored.accentColor, stored.primaryTextTone),
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
    setThemeState(prev => {
      const nextAccent = isAccentColorKey(accentColor) ? accentColor : DEFAULT_ACCENT;
      const suggestedTextTone = getSuggestedPrimaryTextTone(nextAccent);
      return {
        ...prev,
        accentColor: nextAccent,
        primaryTextTone: suggestedTextTone,
        colors: generateColors(nextAccent, suggestedTextTone),
      };
    });
  }, []);

  const setSurfaceTheme = useCallback((surfaceTheme: string) => {
    setThemeState(prev => ({
      ...prev,
      surfaceTheme: isSurfaceThemeKey(surfaceTheme) ? surfaceTheme : DEFAULT_SURFACE,
    }));
  }, []);

  const setPrimaryTextTone = useCallback((primaryTextTone: PrimaryTextTone) => {
    setThemeState(prev => ({
      ...prev,
      primaryTextTone,
      colors: generateColors(prev.accentColor, primaryTextTone),
    }));
  }, []);

  return {
    mode: theme.mode,
    accentColor: theme.accentColor,
    surfaceTheme: theme.surfaceTheme,
    primaryTextTone: theme.primaryTextTone,
    colors: theme.colors,
    accentColors: ACCENT_COLORS as typeof ACCENT_COLORS,
    surfaceThemes: SURFACE_THEMES as typeof SURFACE_THEMES,
    setMode,
    setAccentColor,
    setSurfaceTheme,
    setPrimaryTextTone,
  };
}
