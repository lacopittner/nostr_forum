import { useToastStore } from "../lib/toast";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle size={18} className="text-green-500" />;
      case "error":
        return <AlertCircle size={18} className="text-red-500" />;
      case "warning":
        return <AlertTriangle size={18} className="text-yellow-500" />;
      case "info":
      default:
        return <Info size={18} className="text-blue-500" />;
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case "success":
        return "bg-green-500/10 border-green-500/20";
      case "error":
        return "bg-red-500/10 border-red-500/20";
      case "warning":
        return "bg-yellow-500/10 border-yellow-500/20";
      case "info":
      default:
        return "bg-blue-500/10 border-blue-500/20";
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg animate-in slide-in-from-right ${getBgColor(toast.type)}`}
        >
          {getIcon(toast.type)}
          <p className="flex-1 text-sm text-foreground">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 hover:bg-accent rounded transition-colors"
          >
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>
      ))}
    </div>
  );
}
