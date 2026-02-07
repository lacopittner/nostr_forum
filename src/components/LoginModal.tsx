import { useState } from "react";
import { X, Key, Wallet } from "lucide-react";
import { useNostr } from "../providers/NostrProvider";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login, loginWith_nsec } = useNostr();
  const [activeTab, setActiveTab] = useState<"extension" | "nsec">("extension");
  const [nsec, setNsec] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleExtensionLogin = async () => {
    setIsLoading(true);
    setError("");
    try {
      const success = await login();
      if (success) {
        onClose();
      } else {
        setError("Login failed. Make sure your extension is unlocked.");
      }
    } catch {
      setError("Login failed. Make sure your extension is unlocked.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNsecLogin = async () => {
    if (!nsec.trim()) {
      setError("Please enter your private key");
      return;
    }

    // Basic validation
    if (!nsec.startsWith("nsec1")) {
      setError("Invalid format. Key should start with 'nsec1'");
      return;
    }

    setIsLoading(true);
    setError("");

    const success = await loginWith_nsec(nsec.trim());
    if (success) {
      onClose();
      setNsec("");
    } else {
      setError("Invalid private key. Please check and try again.");
    }

    setIsLoading(false);
  };

  const resetForm = () => {
    setNsec("");
    setError("");
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl max-w-md w-full p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black">Log In</h2>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("extension")}
            className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all ${
              activeTab === "extension"
                ? "bg-[var(--primary)] text-white"
                : "bg-accent/50 text-muted-foreground hover:bg-accent"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Wallet size={16} />
              Extension
            </div>
          </button>
          <button
            onClick={() => setActiveTab("nsec")}
            className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all ${
              activeTab === "nsec"
                ? "bg-[var(--primary)] text-white"
                : "bg-accent/50 text-muted-foreground hover:bg-accent"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Key size={16} />
              Private Key
            </div>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Extension Login */}
        {activeTab === "extension" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use a Nostr browser extension like Alby, nos2x, or Flamingo to log in securely.
            </p>
            
            <button
              onClick={handleExtensionLogin}
              disabled={isLoading}
              className="w-full py-3 bg-[var(--primary)] text-white rounded-lg font-bold hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? "Connecting..." : "Connect with Extension"}
            </button>
            
            <p className="text-xs text-muted-foreground text-center">
              Don't have an extension?{" "}
              <a
                href="https://getalby.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] hover:underline"
              >
                Get Alby
              </a>
            </p>
          </div>
        )}

        {/* nsec Login */}
        {activeTab === "nsec" && (
          <div className="space-y-4">
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-xs text-red-700">
                Security warning: for auto-login after refresh, your private key is stored in browser localStorage on this device. Do not use this option on shared/public computers.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Private Key (nsec1...)</label>
              <input
                type="password"
                value={nsec}
                onChange={(e) => setNsec(e.target.value)}
                placeholder="nsec1..."
                className="w-full bg-accent/50 border-none rounded-lg px-3 py-3 text-sm focus:ring-2 focus:ring-[var(--primary)] font-mono"
                onKeyDown={(e) => e.key === "Enter" && handleNsecLogin()}
              />
            </div>
            
            <button
              onClick={handleNsecLogin}
              disabled={isLoading || !nsec.trim()}
              className="w-full py-3 bg-[var(--primary)] text-white rounded-lg font-bold hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-all"
            >
              {isLoading ? "Validating..." : "Log In with Private Key"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
