import React from "react";
import { useNostr } from "../providers/NostrProvider";
import { WifiOff, AlertCircle } from "lucide-react";

export const ConnectionStatus: React.FC = () => {
  const { connectionStatus, reconnect } = useNostr();

  // Only show when there's actually a problem, not during normal connecting
  if (connectionStatus === "connected") return null;
  
  // Don't show connecting state to avoid flickering
  if (connectionStatus === "connecting") return null;

  const config = {
    disconnected: {
      icon: <WifiOff size={16} />,
      text: "Disconnected",
      className: "bg-orange-500/10 border-orange-500/20 text-orange-600",
      showRetry: true
    },
    error: {
      icon: <AlertCircle size={16} />,
      text: "Connection Error",
      className: "bg-red-500/10 border-red-500/20 text-red-600",
      showRetry: true
    }
  };

  const { icon, text, className, showRetry } = config[connectionStatus];

  return (
    <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full border shadow-lg flex items-center gap-2 transition-all ${className}`}>
      {icon}
      <span className="text-sm font-medium">{text}</span>
      {showRetry && (
        <button
          onClick={reconnect}
          className="ml-2 px-3 py-0.5 bg-current/20 hover:bg-current/30 rounded-full text-xs font-bold transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
};
