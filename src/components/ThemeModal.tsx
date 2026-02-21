import {
  CheckIcon,
  Cross2Icon,
  DesktopIcon,
  MixerHorizontalIcon,
  MoonIcon,
  SunIcon,
  StarIcon,
} from "@radix-ui/react-icons";
import { useTheme } from "../hooks/useTheme";

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const modeOptions = [
  {
    id: "system",
    label: "System",
    description: "Follow your device setting",
    icon: DesktopIcon,
  },
  {
    id: "light",
    label: "Light",
    description: "Bright and airy panels",
    icon: SunIcon,
  },
  {
    id: "dark",
    label: "Dark",
    description: "High contrast for focus",
    icon: MoonIcon,
  },
] as const;

const surfaceOrder = ["default", "twitter", "forest", "amoled", "uniq"] as const;

export function ThemeModal({ isOpen, onClose }: ThemeModalProps) {
  const {
    mode,
    accentColor,
    surfaceTheme,
    primaryTextTone,
    accentColors,
    surfaceThemes,
    setMode,
    setAccentColor,
    setSurfaceTheme,
    setPrimaryTextTone,
  } = useTheme();

  if (!isOpen) return null;

  const typedSurfaceEntries = Object.entries(surfaceThemes) as [
    keyof typeof surfaceThemes,
    (typeof surfaceThemes)[keyof typeof surfaceThemes]
  ][];

  const orderedSurfaceEntries = [...typedSurfaceEntries].sort((a, b) => {
    const aIndex = surfaceOrder.indexOf(a[0] as (typeof surfaceOrder)[number]);
    const bIndex = surfaceOrder.indexOf(b[0] as (typeof surfaceOrder)[number]);

    if (aIndex === -1 && bIndex === -1) return a[0].localeCompare(b[0]);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const selectedSurface =
    surfaceThemes[surfaceTheme as keyof typeof surfaceThemes] ?? surfaceThemes.default;

  const handleSurfaceSelect = (nextSurface: keyof typeof surfaceThemes) => {
    setSurfaceTheme(nextSurface);

    // AMOLED requires dark mode to make visual sense.
    if (nextSurface === "amoled" && mode === "light") {
      setMode("dark");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-5"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-[1.7rem] border border-border/80 bg-card/95 shadow-[0_42px_88px_-45px_rgba(0,0,0,0.92)] animate-fade-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,var(--primary)_0%,transparent_64%)] opacity-20" />

        <div className="relative flex items-center justify-between border-b border-border/70 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-content-center rounded-xl border border-border/80 bg-background/80">
              <MixerHorizontalIcon className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold uppercase tracking-[0.08em]">Appearance Lab</h2>
              <p className="text-xs text-muted-foreground">Tune mode, surface, and accent in one place.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-content-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground transition hover:border-[var(--primary)]/45 hover:text-foreground"
            aria-label="Close appearance settings"
          >
            <Cross2Icon className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="grid max-h-[86vh] overflow-y-auto md:grid-cols-[1.35fr_0.95fr] no-scrollbar">
          <section className="space-y-6 p-4 sm:p-6">
            <div>
              <p className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Mode</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {modeOptions.map(({ id, label, description, icon: Icon }) => {
                  const active = mode === id;

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMode(id)}
                      className={`relative rounded-2xl border p-3 text-left transition ${
                        active
                          ? "border-[var(--primary)]/60 bg-[var(--primary)]/12"
                          : "border-border/70 bg-muted/35 hover:border-border hover:bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`grid h-9 w-9 place-content-center rounded-lg ${
                            active
                              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                              : "bg-background/80 text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <span className="text-sm font-bold">{label}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
                      {active && (
                        <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-content-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                          <CheckIcon className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Surface Style</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {orderedSurfaceEntries.map(([key, value]) => {
                  const active = surfaceTheme === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSurfaceSelect(key)}
                      className={`relative rounded-2xl border p-3 text-left transition ${
                        active
                          ? "border-[var(--primary)]/60 bg-[var(--primary)]/12"
                          : "border-border/70 bg-muted/35 hover:border-border hover:bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold">{value.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{value.description}</p>
                        </div>
                        <div className="flex items-center pt-0.5">
                          <span
                            className="h-4 w-4 rounded-full border border-white/20"
                            style={{ backgroundColor: value.preview.dark }}
                            title="Dark"
                          />
                        </div>
                      </div>
                      {active && (
                        <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-content-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                          <CheckIcon className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="space-y-6 border-t border-border/70 bg-muted/20 p-4 sm:p-6 md:border-l md:border-t-0">
            <div>
              <p className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Accent Color</p>
              <div className="grid grid-cols-4 gap-2.5">
                {Object.entries(accentColors).map(([key, { hue, name }]) => {
                  const active = accentColor === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAccentColor(key)}
                      className={`relative rounded-xl border p-2 transition ${
                        active
                          ? "border-[var(--primary)]/65 bg-[var(--primary)]/10"
                          : "border-border/70 bg-card/70 hover:border-border"
                      }`}
                      title={name}
                    >
                      <span
                        className="mx-auto block h-8 w-8 rounded-full border border-black/10"
                        style={{ backgroundColor: `hsl(${hue} 88% 52%)` }}
                      />
                      <span className="mt-1 block truncate text-[11px] font-semibold">{name}</span>
                      {active && (
                        <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-content-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                          <CheckIcon className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Teal and Yellow default to dark text for readability.
              </p>
            </div>

            <div>
              <p className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Text On Primary
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPrimaryTextTone("light")}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    primaryTextTone === "light"
                      ? "border-[var(--primary)]/60 bg-[var(--primary)]/12"
                      : "border-border/70 bg-card/70 hover:border-border"
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs font-bold">
                    <MoonIcon className="h-4 w-4" />
                    White
                  </span>
                  <span className="mt-2 grid h-8 place-content-center rounded-lg bg-[var(--primary)] text-white text-xs font-black">
                    Aa
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrimaryTextTone("dark")}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    primaryTextTone === "dark"
                      ? "border-[var(--primary)]/60 bg-[var(--primary)]/12"
                      : "border-border/70 bg-card/70 hover:border-border"
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs font-bold">
                    <SunIcon className="h-4 w-4" />
                    Black
                  </span>
                  <span className="mt-2 grid h-8 place-content-center rounded-lg bg-[var(--primary)] text-black text-xs font-black">
                    Aa
                  </span>
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-border/80 bg-card/80 p-4 shadow-[0_24px_45px_-38px_rgba(0,0,0,0.92)]">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Live Preview</p>

              <div className="mt-3 rounded-2xl border border-border/70 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-content-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
                      <StarIcon className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <p className="text-sm font-bold">{selectedSurface.name}</p>
                      <p className="text-[11px] text-muted-foreground">{mode.toUpperCase()} mode</p>
                    </div>
                  </div>
                  <span className="pill-primary">Active</span>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">{selectedSurface.description}</p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" className="btn-primary h-9 text-xs">
                    Primary
                  </button>
                  <button type="button" className="btn-secondary h-9 text-xs">
                    Secondary
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
