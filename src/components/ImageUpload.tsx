import { useState, useRef, useCallback } from "react";
import { X, Loader2, ImageIcon } from "lucide-react";
import { logger } from "../lib/logger";
import { useToast } from "../lib/toast";

interface ImageUploadProps {
  onImageUploaded: (url: string) => void;
  onCancel?: () => void;
}

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
      // nostrcheck returns URL directly or in data.url
      return data.url || data.data?.url || data.file_url || null;
    },
  },
  {
    name: "void.cat",
    upload: async (file: File): Promise<string | null> => {
      const response = await fetch("https://void.cat/upload", {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      // void.cat returns file URL
      return data.url || data.file?.url || null;
    },
  },
  {
    name: "pomf2.lain.la",
    upload: async (file: File): Promise<string | null> => {
      const formData = new FormData();
      formData.append("files[]", file);

      const response = await fetch("https://pomf2.lain.la/upload.php", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      // pomf returns files array
      if (data.files?.[0]?.url) {
        return `https://pomf2.lain.la${data.files[0].url}`;
      }
      return null;
    },
  },
  {
    name: "nostr.build (legacy)",
    upload: async (file: File): Promise<string | null> => {
      const formData = new FormData();
      formData.append("fileToUpload", file);
      formData.append("submit", "Upload Image");

      // Try with CORS proxy first
      try {
        const proxyUrl = "https://api.allorigins.win/raw?url=";
        const targetUrl = encodeURIComponent("https://nostr.build/api/upload.php");
        
        const response = await fetch(`${proxyUrl}${targetUrl}`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) throw new Error(`Proxy failed: ${response.status}`);

        const data = await response.json();
        if (data.url) return data.url;
        if (data.data?.url) return data.data.url;
        
        // Try to parse from text
        const text = await response.text();
        const urlMatch = text.match(/https:\/\/nostr\.build\/i\/[^\s"]+/);
        if (urlMatch) return urlMatch[0];
      } catch {
        // Direct attempt (will likely fail due to CORS)
        const response = await fetch("https://nostr.build/api/upload.php", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (data.url) return data.url;
        if (data.data?.url) return data.data.url;
      }
      
      return null;
    },
  },
];

export function ImageUpload({ onImageUploaded, onCancel }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadService, setUploadService] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error: showError } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const uploadImage = async (file: File): Promise<string | null> => {
    // Try each service until one works
    for (const service of HOSTING_SERVICES) {
      try {
        setUploadService(service.name);
        logger.info(`Trying upload to ${service.name}...`);
        
        const url = await service.upload(file);
        if (url) {
          logger.info(`Upload successful: ${url}`);
          return url;
        }
      } catch (error) {
        logger.warn(`Upload to ${service.name} failed:`, error);
        continue; // Try next service
      }
    }
    
    return null;
  };

  const handleFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      showError("Please select an image file");
      return;
    }

    // Validate file size (max 10MB for better compatibility)
    if (file.size > 10 * 1024 * 1024) {
      showError("Image too large. Max 10MB allowed.");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Upload with fallback
    setIsUploading(true);
    setUploadService(null);
    const url = await uploadImage(file);
    setIsUploading(false);
    setUploadService(null);

    if (url) {
      onImageUploaded(url);
      setPreview(null);
    } else {
      showError("Failed to upload image. All services unavailable. Try again later or use an external host.");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  if (isUploading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-accent/30 rounded-xl border-2 border-dashed border-accent">
        <Loader2 size={32} className="animate-spin text-[var(--primary)] mb-3" />
        <p className="text-sm font-medium text-muted-foreground">
          Uploading{uploadService ? ` via ${uploadService}...` : "..."}
        </p>
        {preview && (
          <img
            src={preview}
            alt="Preview"
            className="mt-4 max-h-32 rounded-lg object-cover opacity-50"
          />
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
        isDragging
          ? "bg-[var(--primary)]/10 border-[var(--primary)]"
          : "bg-accent/30 border-accent hover:bg-accent/50"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {onCancel && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="absolute top-2 right-2 p-1 hover:bg-accent rounded-full transition-colors"
        >
          <X size={16} />
        </button>
      )}

      <ImageIcon
        size={32}
        className={`mb-3 transition-colors ${
          isDragging ? "text-[var(--primary)]" : "text-muted-foreground"
        }`}
      />

      <p className="text-sm font-medium text-center">
        {isDragging ? "Drop image here" : "Click or drag image to upload"}
      </p>

      <p className="text-xs text-muted-foreground mt-1">
        Max 10MB • JPG, PNG, GIF, WebP
      </p>

      <div className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground flex-wrap justify-center">
        <span>Services:</span>
        {HOSTING_SERVICES.map((s, i) => (
          <span key={s.name}>
            <a
              href={`https://${s.name.split(" ")[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hover:text-[var(--primary)] hover:underline"
            >
              {s.name.split(" ")[0]}
            </a>
            {i < HOSTING_SERVICES.length - 1 && ", "}
          </span>
        ))}
      </div>
    </div>
  );
}
