import { useState } from "react";
import { X, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface PostContentProps {
  content: string;
  maxLines?: number;
}

export function PostContent({ content, maxLines = 8 }: PostContentProps) {
  const [expanded, setExpanded] = useState(false);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  
  // Process content to extract images and separate them
  const processContentForMarkdown = (text: string) => {
    const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const urlImageRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg))(\?[^\s]*)?/gi;
    
    const images: string[] = [];
    let cleanText = text;
    
    // Extract markdown images
    cleanText = cleanText.replace(markdownImageRegex, (_match, _alt, url) => {
      images.push(url);
      return ''; // Remove from main text - will show at end
    });
    
    // Extract raw image URLs
    cleanText = cleanText.replace(urlImageRegex, (match) => {
      if (!images.includes(match)) {
        images.push(match);
      }
      return ''; // Remove from main text - will show at end
    });
    
    // Clean up extra whitespace
    cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();
    
    return { cleanText, images };
  };
  
  const { cleanText, images } = processContentForMarkdown(content);
  const lines = cleanText.split('\n');
  const shouldTruncate = !expanded && lines.length > maxLines;
  
  // Truncate text if needed
  const displayText = shouldTruncate 
    ? lines.slice(0, maxLines).join('\n') + '\n...'
    : cleanText;

  return (
    <div className="space-y-3">
      {/* Markdown text content */}
      {displayText && (
        <div className={`prose prose-sm dark:prose-invert max-w-none ${shouldTruncate ? 'line-clamp-4' : ''}`}>
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ node, ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline" />
              ),
            }}
          >
            {displayText}
          </ReactMarkdown>
        </div>
      )}
      
      {/* Expand button */}
      {lines.length > maxLines && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-bold text-[var(--primary)] hover:text-[var(--primary)] transition-colors"
        >
          {expanded ? "Show less" : `Read more (${lines.length - maxLines} more lines)`}
        </button>
      )}
      
      {/* Images section at the end */}
      {images.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground">Attached images:</p>
          <div className={`grid gap-2 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {images.slice(0, 4).map((url, index) => (
              <div
                key={index}
                className="relative aspect-video rounded-lg overflow-hidden bg-accent cursor-pointer group border"
                onClick={() => setShowImageModal(url)}
              >
                <img
                  src={url}
                  alt={`Image ${index + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            ))}
          </div>
          
          {/* Image links */}
          <div className="space-y-1">
            {images.map((url, index) => (
              <a
                key={index}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-[var(--primary)] hover:underline truncate"
              >
                <ExternalLink size={12} />
                <span className="truncate">{url}</span>
              </a>
            ))}
          </div>
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
