import { useState, useRef, useCallback } from "react";
import { X, Loader2, ImageIcon } from "lucide-react";
import { logger } from "../lib/logger";
import { useToast } from "../lib/toast";

interface ImageUploadProps {
  onImageUploaded: (url: string) => void;
  onCancel?: () => void;
}

export function ImageUpload({ onImageUploaded, onCancel }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
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

  const uploadToNostrBuild = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append("fileToUpload", file);
    formData.append("submit", "Upload Image");

    try {
      const response = await fetch("https://nostr.build/api/upload.php", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const data = await response.json();
      
      // nostr.build returns URL in various formats
      if (data.url) return data.url;
      if (data.data?.url) return data.data.url;
      
      // Fallback: try to get from response text
      const text = await response.text();
      const urlMatch = text.match(/https:\/\/nostr\.build\/i\/[^\s"]+/);
      if (urlMatch) return urlMatch[0];

      throw new Error("No URL in response");
    } catch (error) {
      logger.error("Image upload failed:", error);
      return null;
    }
  };

  const handleFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      showError("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showError("Image too large. Max 5MB allowed.");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Upload
    setIsUploading(true);
    const url = await uploadToNostrBuild(file);
    setIsUploading(false);

    if (url) {
      onImageUploaded(url);
      setPreview(null);
    } else {
      showError("Failed to upload image. Please try again.");
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
        <p className="text-sm font-medium text-muted-foreground">Uploading image...</p>
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
        Max 5MB • JPG, PNG, GIF, WebP
      </p>

      <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
        <span>Powered by</span>
        <a
          href="https://nostr.build"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[var(--primary)] hover:underline"
        >
          nostr.build
        </a>
      </div>
    </div>
  );
}
