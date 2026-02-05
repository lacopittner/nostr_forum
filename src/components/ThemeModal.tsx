import { useState } from "react";
import { X, Palette, Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ThemeModal({ isOpen, onClose }: ThemeModalProps) {
  const { mode, accentColor, accentColors, setMode, setAccentColor } = useTheme();
  const [activeTab, setActiveTab] = useState<"mode" | "color">("color");

  if (!isOpen) return null;

  const modes = [
    { id: "light" as const, name: "Light", icon: Sun },
    { id: "dark" as const, name: "Dark", icon: Moon },
    { id: "system" as const, name: "System", icon: Monitor },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl w-full max-w-sm shadow-2xl animate-fade-in">
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

        {/* Tabs */}
        <div className="flex p-2 border-b">
          <button
            onClick={() => setActiveTab("color")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "color"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Accent Color
          </button>
          <button
            onClick={() => setActiveTab("mode")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "mode"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Theme Mode
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {activeTab === "color" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Choose your accent color</p>
              
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

              {/* Preview */}
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-3">Preview</p>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1">Primary</button>
                  <button className="btn-secondary flex-1">Secondary</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {modes.map(({ id, name, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                    mode === id
                      ? "bg-secondary ring-1 ring-[var(--primary)]"
                      : "hover:bg-secondary/50"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    mode === id ? "bg-[var(--primary)] text-white" : "bg-secondary"
                  }`}>
                    <Icon size={20} />
                  </div>
                  <span className="font-medium">{name}</span>
                  {mode === id && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
