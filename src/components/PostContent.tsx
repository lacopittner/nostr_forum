import { useState } from "react";
import DOMPurify from "dompurify";
import { processContent } from "../lib/content";
import { X, ExternalLink } from "lucide-react";

interface PostContentProps {
  content: string;
  maxLines?: number;
}

export function PostContent({ content, maxLines = 8 }: PostContentProps) {
  const [expanded, setExpanded] = useState(false);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  
  // Sanitize content first to prevent XSS
  const sanitizedContent = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [], // Strip all HTML
    ALLOWED_ATTR: [],
  });
  
  const processed = processContent(sanitizedContent);
  const lines = sanitizedContent.split('\n');
  const shouldTruncate = lines.length > maxLines;

  return (
    <div className="space-y-3">
      {/* Text content */}
      <div className="text-sm whitespace-pre-wrap leading-relaxed">
        {processed.text}
        {shouldTruncate && !expanded && (
          <span className="text-muted-foreground">...</span>
        )}
      </div>
      
      {/* Expand button */}
      {shouldTruncate && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-bold text-[var(--primary)] hover:text-[var(--primary)] transition-colors"
        >
          {expanded ? "Show less" : `Read more (${lines.length - maxLines} more lines)`}
        </button>
      )}
      
      {/* Images */}
      {processed.images.length > 0 && (
        <div className={`grid gap-2 ${processed.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {processed.images.slice(0, 4).map((url, index) => (
            <div
              key={index}
              className="relative aspect-video rounded-lg overflow-hidden bg-accent cursor-pointer group"
              onClick={() => setShowImageModal(url)}
            >
              <img
                src={url}
                alt={`Image ${index + 1}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.classList.add('flex', 'items-center', 'justify-center');
                  const placeholder = document.createElement('div');
                  placeholder.className = 'text-muted-foreground text-xs';
                  placeholder.textContent = 'Failed to load image';
                  (e.target as HTMLImageElement).parentElement!.appendChild(placeholder);
                }}
              />
              {processed.images.length > 4 && index === 3 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-lg">
                  +{processed.images.length - 4}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Videos */}
      {processed.videos.map((video, index) => (
        <div key={index} className="aspect-video rounded-lg overflow-hidden bg-black">
          {video.type === "youtube" && (
            <iframe
              src={`https://www.youtube.com/embed/${video.id}`}
              title="YouTube video"
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      ))}
      
      {/* Link previews */}
      {processed.links.length > 0 && (
        <div className="space-y-2">
          {processed.links.slice(0, 1).map((url, index) => (
            <a
              key={index}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 rounded-lg border bg-accent/30 hover:bg-accent/50 transition-colors text-sm"
            >
              <ExternalLink size={16} className="text-muted-foreground shrink-0" />
              <span className="truncate text-muted-foreground hover:text-foreground">
                {url}
              </span>
            </a>
          ))}
        </div>
      )}

      {/* Image Modal */}
      {showImageModal && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowImageModal(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
            onClick={() => setShowImageModal(null)}
          >
            <X size={24} />
          </button>
          <img
            src={showImageModal}
            alt="Full size"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
