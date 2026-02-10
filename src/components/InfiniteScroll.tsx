import React, { useRef, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";

interface InfiniteScrollProps {
  children: React.ReactNode;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  noMoreText?: string;
  threshold?: number;
  className?: string;
}

export const InfiniteScroll: React.FC<InfiniteScrollProps> = ({
  children,
  onLoadMore,
  hasMore,
  isLoading,
  noMoreText = "No more posts",
  threshold = 100,
  className = ""
}) => {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasMore && !isLoading) {
        onLoadMore();
      }
    },
    [hasMore, isLoading, onLoadMore]
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    // Disconnect previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create new observer
    observerRef.current = new IntersectionObserver(handleIntersection, {
      root: null,
      rootMargin: `${threshold}px`,
      threshold: 0
    });

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [handleIntersection, threshold]);

  return (
    <div className={className}>
      {children}
      
      {/* Loading trigger element */}
      <div 
        ref={loadMoreRef}
        className="py-8 flex items-center justify-center"
      >
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-sm">Loading more...</span>
          </div>
        )}
        
        {!hasMore && !isLoading && (
          <div className="text-center text-sm text-muted-foreground">
            {noMoreText}
          </div>
        )}
      </div>
    </div>
  );
};
