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
  const { error: showError } = useToast();

  // Convert various image hosting URLs to direct image links
  const normalizeImageUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      
      // Imgur: imgur.com/xxx -> i.imgur.com/xxx.jpg
      if (urlObj.hostname === 'imgur.com' || urlObj.hostname === 'www.imgur.com') {
        const imageId = urlObj.pathname.replace(/^\//, '').split('/')[0];
        if (imageId) {
          return `https://i.imgur.com/${imageId}.jpg`;
        }
      }
      
      // Imgur already direct link but missing extension
      if (urlObj.hostname === 'i.imgur.com' && !/\.(jpg|jpeg|png|gif|webp)$/i.test(urlObj.pathname)) {
        return `${url}.jpg`;
      }
      
      // Gyazo: gyazo.com/xxx -> i.gyazo.com/xxx.png
      if (urlObj.hostname === 'gyazo.com' || urlObj.hostname === 'www.gyazo.com') {
        const imageId = urlObj.pathname.replace(/^\//, '').split('/')[0];
        if (imageId) {
          return `https://i.gyazo.com/${imageId}.png`;
        }
      }
      
      return url;
    } catch {
      return url;
    }
  };

  // Validate if URL looks like an image
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
    setIsValid(validateUrl(value));
  };

  const handleSubmit = async () => {
    if (!imageUrl.trim()) {
      showError("Please enter an image URL");
      return;
    }

    setIsChecking(true);

    // Normalize URL before validation
    const normalizedUrl = normalizeImageUrl(imageUrl);

    // Basic validation
    if (!validateUrl(imageUrl)) {
      showError("This doesn't look like a valid image URL. Please check the link.");
      setIsChecking(false);
      return;
    }

    // Try to load the image to verify it exists
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = normalizedUrl;
        // Timeout after 10 seconds
        setTimeout(() => reject(new Error("Image load timeout")), 10000);
      });
    } catch {
      // Even if image fails to load, we'll still allow it
      // The user might have a valid URL that just doesn't allow CORS checking
      console.warn("Could not verify image, proceeding anyway");
    }

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
      {imageUrl && isValid && (
        <div className="relative aspect-video bg-accent/30 rounded-lg overflow-hidden">
          <img
            src={normalizeImageUrl(imageUrl)}
            alt="Preview"
            className="w-full h-full object-contain"
            onError={() => {
              setIsValid(false);
              showError("Could not load image. Check the URL.");
            }}
          />
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
