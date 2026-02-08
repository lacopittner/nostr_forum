import { X, Palette, Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ThemeModal({ isOpen, onClose }: ThemeModalProps) {
  const {
    mode,
    accentColor,
    surfaceTheme,
    accentColors,
    setMode,
    setAccentColor,
    setSurfaceTheme,
  } = useTheme();

  if (!isOpen) return null;

  const appearanceOptions = [
    { id: "system", name: "System", icon: Monitor, mode: "system" as const, surface: "default" },
    { id: "light", name: "Light", icon: Sun, mode: "light" as const, surface: "default" },
    { id: "dark", name: "Dark", icon: Moon, mode: "dark" as const, surface: "default" },
    { id: "midnight", name: "Midnight Blue", icon: Moon, mode: "dark" as const, surface: "twitter" },
    { id: "amoled", name: "AMOLED", icon: Moon, mode: "dark" as const, surface: "amoled" },
    { id: "forest", name: "Forest", icon: Moon, mode: "dark" as const, surface: "forest" },
  ];

  const activeAppearanceId = appearanceOptions.find(
    (opt) => opt.mode === mode && opt.surface === surfaceTheme
  )?.id;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
              <Palette size={18} className="text-primary-custom" />
            </div>
            <h2 className="font-semibold">Appearance</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Theme mode</p>
            {appearanceOptions.map(({ id, name, icon: Icon, mode: optionMode, surface }) => (
              <button
                key={id}
                onClick={() => {
                  setMode(optionMode);
                  setSurfaceTheme(surface);
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                  activeAppearanceId === id
                    ? "bg-secondary ring-1 ring-[var(--primary)]"
                    : "hover:bg-secondary/50"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  activeAppearanceId === id ? "bg-[var(--primary)] text-white" : "bg-secondary"
                }`}>
                  <Icon size={20} />
                </div>
                <span className="font-medium">{name}</span>
                {activeAppearanceId === id && (
                  <div className="ml-auto w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="space-y-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">Accent color</p>

            <div className="grid grid-cols-4 gap-3">
              {Object.entries(accentColors).map(([key, { hue, name }]) => (
                <button
                  key={key}
                  onClick={() => setAccentColor(key)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${
                    accentColor === key
                      ? "bg-secondary ring-2 ring-[var(--primary)]"
                      : "hover:bg-secondary/50"
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-full shadow-md"
                    style={{ backgroundColor: `hsl(${hue} 85% 50%)` }}
                  />
                  <span className="text-xs font-medium">{name}</span>
                </button>
              ))}
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-3">Preview</p>
              <div className="flex gap-2">
                <button className="btn-primary flex-1">Primary</button>
                <button className="btn-secondary flex-1">Secondary</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
