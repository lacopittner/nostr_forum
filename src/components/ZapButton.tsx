import { useState } from "react";
import { Zap, X } from "lucide-react";
import { useZaps } from "../hooks/useZaps";

interface ZapButtonProps {
  targetPubkey: string;
  eventId?: string;
  existingZaps?: number;
  size?: "sm" | "md" | "lg";
  showAmount?: boolean;
  showText?: boolean;
}

const ZAP_AMOUNTS = [21, 69, 210, 420, 1000, 5000];

export function ZapButton({ 
  targetPubkey, 
  eventId, 
  existingZaps = 0, 
  size = "sm",
  showAmount = true,
  showText = false
}: ZapButtonProps) {
  const { sendZap, getLightningAddress, isLoading } = useZaps();
  const [isOpen, setIsOpen] = useState(false);
  const [hasLnAddress, setHasLnAddress] = useState<boolean | null>(null);
  const [selectedAmount, setSelectedAmount] = useState(210);
  const [comment, setComment] = useState("");
  const [isSending, setIsSending] = useState(false);

  const iconSize = size === "lg" ? 24 : size === "md" ? 20 : 16;

  const handleOpen = async () => {
    setIsOpen(true);
    const lnAddress = await getLightningAddress(targetPubkey);
    setHasLnAddress(!!lnAddress);
  };

  const handleZap = async () => {
    setIsSending(true);
    const success = await sendZap(targetPubkey, selectedAmount, eventId, comment);
    setIsSending(false);
    if (success) {
      setIsOpen(false);
      setComment("");
    }
  };

  const formatAmount = (sats: number): string => {
    if (sats >= 1000) {
      return `${(sats / 1000).toFixed(sats >= 10000 ? 0 : 1)}k`;
    }
    return sats.toString();
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleOpen();
        }}
        disabled={isLoading}
        className={`flex items-center gap-1.5 transition-all hover:text-yellow-500 ${
          existingZaps > 0 ? "text-yellow-500" : "text-muted-foreground"
        } ${isLoading ? "opacity-50" : ""} ${showText ? "px-2 py-1.5 hover:bg-accent rounded-md text-xs font-bold" : ""}`}
        title="Send sats"
      >
        <Zap size={iconSize} fill={existingZaps > 0 ? "currentColor" : "none"} />
        {showText && <span>Zap</span>}
        {showAmount && existingZaps > 0 && (
          <span className="text-xs font-bold">{formatAmount(existingZaps)}</span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-xl max-w-md w-full p-6 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Zap size={24} className="text-yellow-500" />
                <h2 className="text-xl font-black">Send Zap</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {hasLnAddress === false ? (
              <div className="text-center py-4 text-gray-400">
                <p>This user hasn't configured a Lightning address yet. ⚡</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Amount (sats)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ZAP_AMOUNTS.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setSelectedAmount(amount)}
                        className={`px-3 py-2 rounded-lg font-bold text-sm transition-all ${
                          selectedAmount === amount
                            ? "bg-yellow-500 text-black"
                            : "bg-accent/50 text-foreground hover:bg-accent"
                        }`}
                      >
                        ⚡ {formatAmount(amount)}
                      </button>
                    ))}
                  </div>
                  
                  <div className="mt-2">
                    <input
                      type="number"
                      value={selectedAmount}
                      onChange={(e) => setSelectedAmount(parseInt(e.target.value) || 0)}
                      placeholder="Custom amount"
                      className="w-full bg-accent/50 border rounded-lg p-2 text-sm focus:ring-1 focus:ring-yellow-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Comment (optional)</label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a message..."
                    maxLength={140}
                    className="w-full bg-accent/50 border rounded-lg p-3 text-sm focus:ring-1 focus:ring-yellow-500 min-h-[80px] resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">{comment.length}/140</p>
                </div>

                <button
                  onClick={handleZap}
                  disabled={isSending || selectedAmount <= 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500 text-black rounded-lg font-bold hover:bg-yellow-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Zap size={20} />
                  {isSending ? "Opening Wallet..." : `Zap ${formatAmount(selectedAmount)} sats`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
