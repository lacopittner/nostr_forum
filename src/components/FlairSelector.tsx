import { useState } from "react";

interface FlairSelectorProps {
  flairs: string[];
  selectedFlair: string | null;
  onSelect: (flair: string | null) => void;
  disabled?: boolean;
}

export function FlairSelector({ flairs, selectedFlair, onSelect, disabled }: FlairSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (flairs.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
          selectedFlair
            ? "bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30"
            : "bg-accent/50 text-gray-400 border border-transparent hover:bg-accent"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span>{selectedFlair || "Select flair"}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 w-48 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
            <button
              onClick={() => {
                onSelect(null);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors ${
                !selectedFlair ? "bg-[var(--primary)]/10 text-[var(--primary)]" : ""
              }`}
            >
              No flair
            </button>
            {flairs.map((flair) => (
              <button
                key={flair}
                onClick={() => {
                  onSelect(flair);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors ${
                  selectedFlair === flair ? "bg-[var(--primary)]/10 text-[var(--primary)]" : ""
                }`}
              >
                {flair}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
