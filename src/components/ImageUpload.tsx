import { useState } from "react";
import { X, Link2, ImageIcon, Check } from "lucide-react";
import { useToast } from "../lib/toast";

interface ImageUploadProps {
  onImageUploaded: (url: string) => void;
  onCancel?: () => void;
}

export function ImageUpload({ onImageUploaded, onCancel }: ImageUploadProps) {
  const [imageUrl, setImageUrl] = useState("");
  const [isValid, setIsValid] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const { error: showError } = useToast();

  // Convert various image hosting URLs to direct image links
  const normalizeImageUrl = (url: string): string => {
    console.log('[ImageUpload] Normalizing URL:', url);
    try {
      const urlObj = new URL(url);
      console.log('[ImageUpload] Parsed URL:', { hostname: urlObj.hostname, pathname: urlObj.pathname });
      
      // Imgur: imgur.com/xxx -> i.imgur.com/xxx.jpg
      if (urlObj.hostname === 'imgur.com' || urlObj.hostname === 'www.imgur.com') {
        const imageId = urlObj.pathname.replace(/^\//, '').split('/')[0];
        console.log('[ImageUpload] Imgur gallery detected, imageId:', imageId);
        if (imageId) {
          const newUrl = `https://i.imgur.com/${imageId}.jpg`;
          console.log('[ImageUpload] Converted to:', newUrl);
          return newUrl;
        }
      }
      
      // Imgur already direct link but missing extension
      if (urlObj.hostname === 'i.imgur.com' && !/\.(jpg|jpeg|png|gif|webp)$/i.test(urlObj.pathname)) {
        const newUrl = `${url}.jpg`;
        console.log('[ImageUpload] Added extension:', newUrl);
        return newUrl;
      }
      
      // Gyazo: gyazo.com/xxx -> i.gyazo.com/xxx.png
      if (urlObj.hostname === 'gyazo.com' || urlObj.hostname === 'www.gyazo.com') {
        const imageId = urlObj.pathname.replace(/^\//, '').split('/')[0];
        if (imageId) {
          const newUrl = `https://i.gyazo.com/${imageId}.png`;
          console.log('[ImageUpload] Gyazo converted:', newUrl);
          return newUrl;
        }
      }
      
      console.log('[ImageUpload] No conversion needed');
      return url;
    } catch (e) {
      console.log('[ImageUpload] URL parse error:', e);
      return url;
    }
  };

  // Validate if URL looks like an image
  const validateUrl = (url: string) => {
    console.log('[ImageUpload] Validating URL:', url);
    const normalizedUrl = normalizeImageUrl(url);
    console.log('[ImageUpload] Normalized URL:', normalizedUrl);
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
      console.log('[ImageUpload] Validating normalized:', { hostname: urlObj.hostname, pathname: urlObj.pathname });
      const hasImageExt = imageExtensions.test(url);
      const isImageHost = imageHosts.some((host) => urlObj.hostname.includes(host));
      const hasImageInPath = urlObj.pathname.includes("/i/") || urlObj.pathname.includes("/img/");
      
      const result = hasImageExt || isImageHost || hasImageInPath;
      console.log('[ImageUpload] Validation result:', { hasImageExt, isImageHost, hasImageInPath, result });

      return result;
    } catch (e) {
      console.log('[ImageUpload] Validation error:', e);
      return false;
    }
  };

  const handleUrlChange = (value: string) => {
    console.log('[ImageUpload] URL change:', value);
    setImageUrl(value);
    setPreviewFailed(false);
    const valid = validateUrl(value);
    console.log('[ImageUpload] Setting isValid:', valid);
    setIsValid(valid);
  };

  const handleSubmit = async () => {
    console.log('[ImageUpload] Submit clicked, url:', imageUrl);
    if (!imageUrl.trim()) {
      showError("Please enter an image URL");
      return;
    }

    setIsChecking(true);

    // Normalize URL before validation
    const normalizedUrl = normalizeImageUrl(imageUrl);
    console.log('[ImageUpload] Submit normalized URL:', normalizedUrl);

    // Basic validation
    const isUrlValid = validateUrl(imageUrl);
    console.log('[ImageUpload] Submit validation:', isUrlValid);
    if (!isUrlValid) {
      console.log('[ImageUpload] Validation failed, showing error');
      showError("This doesn't look like a valid image URL. Please check the link.");
      setIsChecking(false);
      return;
    }

    // Try to load the image to verify it exists
    console.log('[ImageUpload] Attempting to load image:', normalizedUrl);
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          console.log('[ImageUpload] Image loaded successfully');
          resolve();
        };
        img.onerror = (e) => {
          console.log('[ImageUpload] Image failed to load:', e);
          reject(new Error("Failed to load image"));
        };
        img.src = normalizedUrl;
        // Timeout after 10 seconds
        setTimeout(() => {
          console.log('[ImageUpload] Image load timeout');
          reject(new Error("Image load timeout"));
        }, 10000);
      });
    } catch (e) {
      console.warn('[ImageUpload] Could not verify image:', e);
    }

    console.log('[ImageUpload] Calling onImageUploaded with:', normalizedUrl);
    setIsChecking(false);
    onImageUploaded(normalizedUrl);
  };

  // Quick paste handler
  const handlePaste = (e: React.ClipboardEvent) => {
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

      {/* Header */}
      <div className="flex items-center gap-2">
        <ImageIcon size={20} className="text-[var(--primary)]" />
        <h3 className="font-bold text-sm">Add Image</h3>
      </div>

      {/* URL Input */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Image URL
        </label>
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

      {/* Preview */}
      {imageUrl && isValid && !previewFailed && (
        <div className="relative aspect-video bg-accent/30 rounded-lg overflow-hidden">
          <img
            src={normalizeImageUrl(imageUrl)}
            alt="Preview"
            className="w-full h-full object-contain"
            onError={(e) => {
              const normalized = normalizeImageUrl(imageUrl);
              console.log('[ImageUpload] Preview image error for:', normalized);
              
              // Try PNG fallback for Imgur
              if (normalized.includes('i.imgur.com') && normalized.endsWith('.jpg')) {
                const pngUrl = normalized.replace('.jpg', '.png');
                console.log('[ImageUpload] Trying PNG fallback:', pngUrl);
                const img = e.currentTarget;
                img.src = pngUrl;
                return;
              }
              
              // Try without extension for Imgur
              if (normalized.includes('i.imgur.com')) {
                const noExtUrl = normalized.replace(/\.(jpg|png)$/, '');
                console.log('[ImageUpload] Trying no-extension fallback:', noExtUrl);
                const img = e.currentTarget;
                img.src = noExtUrl;
                return;
              }
              
              console.log('[ImageUpload] All fallbacks failed, allowing use anyway');
              setPreviewFailed(true);
            }}
          />
        </div>
      )}

      {/* Preview failed warning */}
      {previewFailed && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            ⚠️ Could not load preview. The image may still work when posted.
          </p>
        </div>
      )}

      {/* Supported hosts info */}
      <div className="text-[10px] text-muted-foreground">
        <p className="mb-1">Supported hosts:</p>
        <p className="opacity-70">
          Imgur, Nostr.build, Nostrcheck.me, Void.cat, Catbox.moe,
          GitHub, AWS S3, Supabase, Firebase, and any direct image links
        </p>
      </div>

      {/* Actions */}
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
          onClick={handleSubmit}
          disabled={!isValid || isChecking}
          className="flex-1 px-4 py-2 bg-[var(--primary)] text-white text-sm font-bold rounded-lg hover:bg-[var(--primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isChecking ? "Checking..." : "Add Image"}
        </button>
      </div>
    </div>
  );
}

// Old file upload code - commented out for now
/*
import { useState, useRef, useCallback } from "react";
import { logger } from "../lib/logger";

// List of image hosting services to try
const HOSTING_SERVICES = [
  {
    name: "nostrcheck.me",
    upload: async (file: File): Promise<string | null> => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("https://nostrcheck.me/api/upload.php", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return data.url || data.data?.url || data.file_url || null;
    },
  },
  // ... more services
];

// File upload implementation with drag & drop
// Keeping this code for future use when CORS is resolved
*/
