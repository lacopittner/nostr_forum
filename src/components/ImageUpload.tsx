import { useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent } from "react";
import { X, Link2, ImageIcon, Check, UploadCloud } from "lucide-react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useToast } from "../lib/toast";
import { useNostr } from "../providers/NostrProvider";

interface ImageUploadProps {
  onImageUploaded: (url: string) => void;
  onCancel?: () => void;
}

const NIP98_AUTH_KIND = 27235;

type UploadMode = "url" | "file";

const toBase64 = (value: string): string => {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(value);
  }
  throw new Error("Base64 encoding is not available in this environment");
};

const sha256Hex = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export function ImageUpload({ onImageUploaded, onCancel }: ImageUploadProps) {
  const { ndk, user } = useNostr();
  const { error: showError } = useToast();

  const [mode, setMode] = useState<UploadMode>("url");
  const [imageUrl, setImageUrl] = useState("");
  const [isValid, setIsValid] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadEndpoint = (import.meta.env.VITE_NIP98_UPLOAD_URL || "").trim();
  const uploadMethod = ((import.meta.env.VITE_NIP98_UPLOAD_METHOD || "PUT").toUpperCase() === "POST"
    ? "POST"
    : "PUT") as "PUT" | "POST";

  const normalizeImageUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);

      if (urlObj.hostname === "imgur.com" || urlObj.hostname === "www.imgur.com") {
        const imageId = urlObj.pathname.replace(/^\//, "").split("/")[0];
        if (imageId) return `https://i.imgur.com/${imageId}.jpg`;
      }

      if (urlObj.hostname === "i.imgur.com" && !/\.(jpg|jpeg|png|gif|webp)$/i.test(urlObj.pathname)) {
        return `${url}.jpg`;
      }

      if (urlObj.hostname === "gyazo.com" || urlObj.hostname === "www.gyazo.com") {
        const imageId = urlObj.pathname.replace(/^\//, "").split("/")[0];
        if (imageId) return `https://i.gyazo.com/${imageId}.png`;
      }

      return url;
    } catch {
      return url;
    }
  };

  const validateUrl = (url: string) => {
    const normalizedUrl = normalizeImageUrl(url);
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i;
    const imageHosts = [
      "imgur.com",
      "i.imgur.com",
      "nostr.build",
      "nostrcheck.me",
      "void.cat",
      "pomf2.lain.la",
      "catbox.moe",
      "ibb.co",
      "postimg.cc",
      "imageban.ru",
      "wimg.io",
      "cubeupload.com",
      "freeimage.host",
      "ctrlv.cz",
      "prnt.sc",
      "prntscr.com",
      "gyazo.com",
      "i.gyazo.com",
      "puu.sh",
      "imageup.ru",
      "snag.gy",
      "cloudinary.com",
      "aws.amazon.com",
      "s3.amazonaws.com",
      "digitaloceanspaces.com",
      "supabase.co",
      "firebaseapp.com",
      "githubusercontent.com",
    ];

    try {
      const urlObj = new URL(normalizedUrl);
      const hasImageExt = imageExtensions.test(url);
      const isImageHost = imageHosts.some((host) => urlObj.hostname.includes(host));
      const hasImageInPath = urlObj.pathname.includes("/i/") || urlObj.pathname.includes("/img/");

      return hasImageExt || isImageHost || hasImageInPath;
    } catch {
      return false;
    }
  };

  const handleUrlChange = (value: string) => {
    setImageUrl(value);
    setPreviewFailed(false);
    setIsValid(validateUrl(value));
  };

  const createNip98AuthHeader = async (
    method: "PUT" | "POST",
    requestUrl: string,
    payloadHash?: string
  ): Promise<string> => {
    if (!user) {
      throw new Error("Login is required for authenticated upload");
    }

    const authEvent = new NDKEvent(ndk);
    authEvent.kind = NIP98_AUTH_KIND as any;
    authEvent.content = "";
    authEvent.tags = [["u", requestUrl], ["method", method]];

    if (payloadHash) {
      authEvent.tags.push(["payload", payloadHash]);
    }

    await authEvent.sign();
    return `Nostr ${toBase64(JSON.stringify(authEvent.rawEvent()))}`;
  };

  const extractUploadedUrl = (bodyText: string): string | null => {
    try {
      const json = JSON.parse(bodyText) as
        | { url?: string; data?: { url?: string }; image?: string; file_url?: string }
        | undefined;
      const fromJson = json?.url || json?.data?.url || json?.image || json?.file_url;
      if (fromJson) return fromJson;
    } catch {
      // Response is not JSON, continue with plain text heuristics.
    }

    const trimmed = bodyText.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return null;
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      showError("Choose an image file first.");
      return;
    }

    if (!uploadEndpoint) {
      showError("File upload endpoint is not configured. Set VITE_NIP98_UPLOAD_URL.");
      return;
    }

    if (!ndk.signer || !user) {
      showError("Please login first. NIP-98 upload requires a signer.");
      return;
    }

    setIsChecking(true);

    try {
      const payloadHash = await sha256Hex(selectedFile);
      const authHeader = await createNip98AuthHeader(uploadMethod, uploadEndpoint, payloadHash);

      const headers: Record<string, string> = {
        Authorization: authHeader,
      };

      let body: BodyInit;
      if (uploadMethod === "PUT") {
        body = selectedFile;
        if (selectedFile.type) {
          headers["Content-Type"] = selectedFile.type;
        }
      } else {
        const formData = new FormData();
        formData.append("file", selectedFile);
        body = formData;
      }

      const response = await fetch(uploadEndpoint, {
        method: uploadMethod,
        headers,
        body,
      });

      const bodyText = await response.text();
      const uploadedUrl = extractUploadedUrl(bodyText);

      if (!response.ok || !uploadedUrl) {
        throw new Error(`Upload failed (${response.status})`);
      }

      onImageUploaded(normalizeImageUrl(uploadedUrl));
    } catch (error) {
      showError(
        error instanceof Error
          ? `Upload failed: ${error.message}`
          : "Upload failed. Check your upload server and NIP-98 verification."
      );
    } finally {
      setIsChecking(false);
    }
  };

  const handleUrlSubmit = async () => {
    if (!imageUrl.trim()) {
      showError("Please enter an image URL");
      return;
    }

    setIsChecking(true);

    const normalizedUrl = normalizeImageUrl(imageUrl);

    if (!validateUrl(imageUrl)) {
      showError("This doesn't look like a valid image URL. Please check the link.");
      setIsChecking(false);
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = normalizedUrl;
        setTimeout(() => reject(new Error("Image load timeout")), 10000);
      });
    } catch {
      // Keep permissive behavior - let user add URL even if preview probe fails.
    }

    setIsChecking(false);
    onImageUploaded(normalizedUrl);
  };

  const handleSubmit = async () => {
    if (mode === "file") {
      await handleFileUpload();
      return;
    }
    await handleUrlSubmit();
  };

  const handlePaste = (e: ReactClipboardEvent<HTMLInputElement>) => {
    if (mode !== "url") return;
    const pastedText = e.clipboardData.getData("text");
    if (validateUrl(pastedText)) {
      e.preventDefault();
      setImageUrl(pastedText);
      setIsValid(true);
    }
  };

  return (
    <div className="relative bg-card border rounded-xl p-4 space-y-4">
      {onCancel && (
        <button
          onClick={onCancel}
          className="absolute top-2 right-2 p-1.5 hover:bg-accent rounded-full transition-colors"
        >
          <X size={16} />
        </button>
      )}

      <div className="flex items-center gap-2">
        <ImageIcon size={20} className="text-[var(--primary)]" />
        <h3 className="font-bold text-sm">Add Image</h3>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
            mode === "url"
              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "bg-accent/60 text-foreground hover:bg-accent"
          }`}
        >
          URL
        </button>
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
            mode === "file"
              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "bg-accent/60 text-foreground hover:bg-accent"
          }`}
        >
          NIP-98 Upload
        </button>
      </div>

      {mode === "url" ? (
        <>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Image URL</label>
            <div className="relative">
              <Link2
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                onPaste={handlePaste}
                placeholder="https://example.com/image.jpg"
                className="w-full pl-9 pr-10 py-2.5 bg-background border rounded-lg text-sm focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              />
              {isValid && (
                <Check
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500"
                />
              )}
            </div>
          </div>

          {imageUrl && isValid && !previewFailed && (
            <div className="relative aspect-video bg-accent/30 rounded-lg overflow-hidden">
              <img
                src={normalizeImageUrl(imageUrl)}
                alt="Preview"
                className="w-full h-full object-contain"
                onError={() => {
                  setPreviewFailed(true);
                }}
              />
            </div>
          )}

          {previewFailed && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                Preview failed. The image may still work when posted.
              </p>
            </div>
          )}

          <div className="text-[10px] text-muted-foreground">
            <p className="mb-1">Supported hosts:</p>
            <p className="opacity-70">
              Imgur, Nostr.build, Nostrcheck.me, Void.cat, Catbox.moe,
              GitHub, AWS S3, Supabase, Firebase, and direct image links.
            </p>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Select image file</label>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              setSelectedFile(file);
            }}
            className="w-full bg-background border rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            This signs your HTTP upload request with NIP-98 and sends it to your upload server.
          </p>
          {selectedFile && (
            <div className="text-xs text-muted-foreground">
              Selected: <span className="font-semibold text-foreground">{selectedFile.name}</span>
            </div>
          )}
          {!uploadEndpoint && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-300">
              Configure <code>VITE_NIP98_UPLOAD_URL</code> to enable file upload.
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm font-bold hover:bg-accent rounded-lg transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => void handleSubmit()}
          disabled={
            isChecking ||
            (mode === "url" ? !isValid : !selectedFile || !uploadEndpoint)
          }
          className="flex-1 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-bold rounded-lg hover:bg-[var(--primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
        >
          {isChecking ? (
            "Processing..."
          ) : mode === "file" ? (
            <>
              <UploadCloud size={16} />
              Upload File
            </>
          ) : (
            "Add Image"
          )}
        </button>
      </div>
    </div>
  );
}
