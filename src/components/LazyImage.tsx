import { useState } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
}

export function LazyImage({ src, alt, className = "", placeholder }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className={`bg-accent/50 flex items-center justify-center ${className}`}>
        <span className="text-muted-foreground text-xs">Failed to load</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {!isLoaded && placeholder && (
        <div 
          className={`bg-accent/30 animate-pulse absolute inset-0 ${className}`}
        />
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  );
}
