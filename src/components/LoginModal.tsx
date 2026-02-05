import { useState } from "react";
import { X, Key, Wallet, Lock, Shield } from "lucide-react";
import { useNostr } from "../providers/NostrProvider";
import { encryptNsec, saveEncryptedNsec } from "../lib/crypto";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login, loginWith_nsec } = useNostr();
  const [activeTab, setActiveTab] = useState<"extension" | "nsec">("extension");
  const [nsec, setNsec] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"input" | "create-pin">("input");

  if (!isOpen) return null;

  const handleExtensionLogin = async () => {
    setIsLoading(true);
    setError("");
    try {
      await login();
      onClose();
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

    // First step - validate nsec
    if (step === "input") {
      setIsLoading(true);
      setError("");
      
      // Try to login to validate the key
      const success = await loginWith_nsec(nsec.trim());
      
      if (success) {
        setStep("create-pin");
      } else {
        setError("Invalid private key. Please check and try again.");
      }
      
      setIsLoading(false);
      return;
    }

    // Second step - create PIN
    if (step === "create-pin") {
      if (pin.length < 4) {
        setError("PIN must be at least 4 digits");
        return;
      }
      
      if (pin !== confirmPin) {
        setError("PINs do not match");
        return;
      }

      setIsLoading(true);
      setError("");
      
      try {
        // Encrypt nsec with PIN
        const encrypted = await encryptNsec(nsec.trim(), pin);
        saveEncryptedNsec(encrypted);
        
        // Already logged in from first step
        onClose();
        setNsec("");
        setPin("");
        setConfirmPin("");
        setStep("input");
      } catch {
        setError("Failed to secure your key. Please try again.");
      }
      
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setStep("input");
    setNsec("");
    setPin("");
    setConfirmPin("");
    setError("");
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl max-w-md w-full p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black">{step === "create-pin" ? "Secure Your Key" : "Log In"}</h2>
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

        {step === "input" && (
          <>
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
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-xs text-yellow-700">
                    ⚠️ Your private key will be encrypted with a PIN and stored locally. Never share your nsec with anyone.
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
                  {isLoading ? "Validating..." : "Continue"}
                </button>
              </div>
            )}
          </>
        )}

        {/* PIN Creation Step */}
        {step === "create-pin" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <Shield size={20} className="text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-700">Key validated!</p>
                <p className="text-xs text-green-600">Create a PIN to secure it</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium mb-2">Create PIN (min 4 digits)</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter PIN"
                maxLength={6}
                className="w-full bg-accent/50 border-none rounded-lg px-3 py-3 text-sm focus:ring-2 focus:ring-[var(--primary)] text-center text-2xl tracking-widest"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Confirm PIN</label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                placeholder="Confirm PIN"
                maxLength={6}
                className="w-full bg-accent/50 border-none rounded-lg px-3 py-3 text-sm focus:ring-2 focus:ring-[var(--primary)] text-center text-2xl tracking-widest"
                onKeyDown={(e) => e.key === "Enter" && handleNsecLogin()}
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={resetForm}
                className="flex-1 py-3 bg-accent text-foreground rounded-lg font-bold hover:bg-accent/80 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleNsecLogin}
                disabled={isLoading || pin.length < 4 || pin !== confirmPin}
                className="flex-1 py-3 bg-[var(--primary)] text-white rounded-lg font-bold hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <Lock size={16} />
                {isLoading ? "Securing..." : "Secure & Login"}
              </button>
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              🔐 Your key will be encrypted with AES-256-GCM
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
