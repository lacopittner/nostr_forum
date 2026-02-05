import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface GalleryProps {
  images: string[];
  alt?: string;
}

export function Gallery({ images, alt = "Image" }: GalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!images || images.length === 0) return null;

  const goToPrevious = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const openLightbox = () => setLightboxOpen(true);
  const closeLightbox = () => setLightboxOpen(false);

  // Single image - no gallery UI needed
  if (images.length === 1) {
    return (
      <div className="relative overflow-hidden rounded-lg max-h-[540px] bg-black/5">
        <img
          src={images[0]}
          alt={alt}
          className="w-full h-auto max-h-[540px] object-contain cursor-pointer"
          onClick={openLightbox}
        />
        
        {lightboxOpen && (
          <Lightbox src={images[0]} alt={alt} onClose={closeLightbox} />
        )}
      </div>
    );
  }

  // Multiple images - gallery with navigation
  return (
    <>
      <div className="relative overflow-hidden rounded-lg bg-black/5 group">
        {/* Main image */}
        <div className="relative aspect-video max-h-[540px]">
          <img
            src={images[currentIndex]}
            alt={`${alt} ${currentIndex + 1}`}
            className="w-full h-full object-contain cursor-pointer"
            onClick={openLightbox}
          />
        </div>

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ChevronLeft size={20} />
            </button>
            
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* Counter */}
        <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
          {currentIndex + 1} / {images.length}
        </div>

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <div className="flex gap-1 p-2 bg-background/90 border-t">
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(idx);
                }}
                className={`w-12 h-12 rounded overflow-hidden flex-shrink-0 border-2 transition-colors ${
                  idx === currentIndex ? "border-[var(--primary)]" : "border-transparent hover:border-gray-300"
                }`}
              >
                <img
                  src={img}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <Lightbox
          src={images[currentIndex]}
          alt={`${alt} ${currentIndex + 1}`}
          onClose={closeLightbox}
          onPrev={images.length > 1 ? goToPrevious : undefined}
          onNext={images.length > 1 ? goToNext : undefined}
        />
      )}
    </>
  );
}

// Lightbox component
interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
  onPrev?: (e: React.MouseEvent) => void;
  onNext?: (e: React.MouseEvent) => void;
}

function Lightbox({ src, alt, onClose, onPrev, onNext }: LightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors z-10"
      >
        <X size={20} />
      </button>

      {/* Image */}
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Navigation in lightbox */}
      {onPrev && (
        <button
          onClick={onPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      
      {onNext && (
        <button
          onClick={onNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}
