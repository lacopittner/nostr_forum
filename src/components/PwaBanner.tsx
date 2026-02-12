import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";

const INSTALL_PROMPT_SUPPRESSION_KEY = "nostr-reddit-pwa-install-dismissed-at";
const INSTALL_PROMPT_SUPPRESSION_MS = 7 * 24 * 60 * 60 * 1000;

const isStandaloneDisplayMode = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

const isIOSDevice = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);
const isAndroidChrome = () => {
  const ua = window.navigator.userAgent.toLowerCase();
  const isAndroid = ua.includes("android");
  const isChrome = ua.includes("chrome");
  const isExcludedBrowser =
    ua.includes("edg") || ua.includes("opr/") || ua.includes("samsungbrowser");

  return isAndroid && isChrome && !isExcludedBrowser;
};

const shouldSuppressInstallPrompt = () => {
  const raw = localStorage.getItem(INSTALL_PROMPT_SUPPRESSION_KEY);
  if (!raw) return false;

  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) return false;

  return Date.now() - dismissedAt < INSTALL_PROMPT_SUPPRESSION_MS;
};

export function PwaBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [isStandalone, setIsStandalone] = useState(() => isStandaloneDisplayMode());
  const [isInstalling, setIsInstalling] = useState(false);
  const [suppressInstallPrompt, setSuppressInstallPrompt] = useState(false);

  const dismissInstallPrompt = useCallback(() => {
    setSuppressInstallPrompt(true);
    setDeferredPrompt(null);
    localStorage.setItem(INSTALL_PROMPT_SUPPRESSION_KEY, Date.now().toString());
  }, []);

  const applyUpdate = useCallback(() => {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
  }, [waitingWorker]);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt || isInstalling) return;

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        localStorage.removeItem(INSTALL_PROMPT_SUPPRESSION_KEY);
      }
      setDeferredPrompt(null);
    } catch {
      // Ignore prompt errors; browser controls availability.
    } finally {
      setIsInstalling(false);
    }
  }, [deferredPrompt, isInstalling]);

  useEffect(() => {
    setSuppressInstallPrompt(shouldSuppressInstallPrompt());
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setSuppressInstallPrompt(false);
      localStorage.removeItem(INSTALL_PROMPT_SUPPRESSION_KEY);
    };

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    const handleDisplayModeChange = () => {
      setIsStandalone(isStandaloneDisplayMode());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleDisplayModeChange);
    } else if (typeof legacyMediaQuery.addListener === "function") {
      legacyMediaQuery.addListener(handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleDisplayModeChange);
      } else if (typeof legacyMediaQuery.removeListener === "function") {
        legacyMediaQuery.removeListener(handleDisplayModeChange);
      }
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let updateTimer: number | undefined;
    let reloading = false;
    let isActive = true;

    const handleControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const trackRegistration = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener("statechange", () => {
          if (!isActive) return;
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(installingWorker);
          }
        });
      });
    };

    const registerServiceWorker = async () => {
      if (!import.meta.env.PROD) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        return;
      }

      const registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        { scope: import.meta.env.BASE_URL }
      );
      if (!isActive) return;

      trackRegistration(registration);
      updateTimer = window.setInterval(() => {
        void registration.update();
      }, 30 * 60 * 1000);
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    void registerServiceWorker().catch(() => {
      // If registration fails, app still runs online.
    });

    return () => {
      isActive = false;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      if (updateTimer) {
        window.clearInterval(updateTimer);
      }
    };
  }, []);

  if (waitingWorker) {
    return (
      <div className="fixed left-4 right-4 bottom-24 sm:left-auto sm:right-4 sm:bottom-4 z-[90] max-w-sm rounded-xl border bg-card shadow-xl p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-[var(--primary)]">
            <RefreshCw size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Update available</p>
            <p className="text-xs text-muted-foreground mt-1">
              A new app version is ready. Reload to apply the update.
            </p>
            <button
              onClick={applyUpdate}
              className="mt-3 w-full btn-primary justify-center"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }

  const showInstallPrompt = Boolean(deferredPrompt) && !isStandalone && !suppressInstallPrompt;
  const showIOSHint = !showInstallPrompt && isIOSDevice() && !isStandalone && !suppressInstallPrompt;
  const showAndroidManualHint =
    !showInstallPrompt && isAndroidChrome() && !isStandalone && !suppressInstallPrompt;

  if (!showInstallPrompt && !showIOSHint && !showAndroidManualHint) {
    return null;
  }

  return (
    <div className="fixed left-4 right-4 bottom-24 sm:left-auto sm:right-4 sm:bottom-4 z-[90] max-w-sm rounded-xl border bg-card shadow-xl p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-[var(--primary)]">
          <Download size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install app</p>
          <p className="text-xs text-muted-foreground mt-1">
            {showInstallPrompt
              ? "Add NostrReddit to your home screen for a native app experience."
              : showIOSHint
                ? "On iPhone/iPad, open Share and choose Add to Home Screen."
                : window.isSecureContext
                  ? "In Chrome on Android: menu (three dots) -> Install app."
                  : "Install requires HTTPS. Open the app on a secure (https://) URL."}
          </p>

          {showInstallPrompt && (
            <button
              onClick={() => {
                void triggerInstall();
              }}
              disabled={isInstalling}
              className="mt-3 w-full btn-primary justify-center disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isInstalling ? "Opening..." : "Install"}
            </button>
          )}
        </div>

        <button
          onClick={dismissInstallPrompt}
          className="p-1 rounded-md hover:bg-accent transition-colors text-muted-foreground"
          aria-label="Dismiss install prompt"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
