import { useState } from "react";
import { Lock, X } from "lucide-react";

interface PinUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: (pin: string) => void;
  error?: string;
}

export function PinUnlockModal({ isOpen, onClose, onUnlock, error }: PinUnlockModalProps) {
  const [pin, setPin] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (pin.length >= 4) {
      onUnlock(pin);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl max-w-sm w-full p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
              <Lock size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black">Welcome Back</h2>
              <p className="text-sm text-muted-foreground">Enter your PIN to unlock</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}
        
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="Enter PIN"
          maxLength={6}
          autoFocus
          className="w-full bg-accent/50 border-none rounded-lg px-3 py-4 text-sm focus:ring-2 focus:ring-orange-500 text-center text-2xl tracking-widest mb-4"
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        
        <button
          onClick={handleSubmit}
          disabled={pin.length < 4}
          className="w-full py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50 transition-all"
        >
          Unlock
        </button>
        
        <p className="text-xs text-muted-foreground text-center mt-4">
          Forgot PIN?{" "}
          <button
            onClick={onClose}
            className="text-orange-600 hover:underline"
          >
            Log in with different key
          </button>
        </p>
      </div>
    </div>
  );
}
