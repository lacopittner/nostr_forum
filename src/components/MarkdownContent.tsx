import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
  maxLines?: number;
}

export function MarkdownContent({ content, maxLines }: MarkdownContentProps) {
  // Process content to extract images and move them to the end
  const processContent = (text: string) => {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const urlRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico))(\?[^\s]*)?/gi;
    
    const images: string[] = [];
    let cleanText = text;
    
    // Extract markdown images
    cleanText = cleanText.replace(imageRegex, (_match, _alt, url) => {
      images.push(url);
      return ''; // Remove from main text
    });
    
    // Extract raw image URLs (also remove them from text)
    cleanText = cleanText.replace(urlRegex, (match) => {
      // Only add if not already in images
      if (!images.includes(match)) {
        images.push(match);
      }
      return ''; // Remove from main text
    });
    
    // Clean up extra whitespace
    cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();
    
    return { cleanText, images };
  };
  
  const { cleanText, images } = processContent(content);
  
  const lineClampClass = maxLines ? `line-clamp-${maxLines}` : '';
  
  return (
    <div className="space-y-4">
      {/* Main text content */}
      {cleanText && (
        <div className={`prose prose-sm dark:prose-invert max-w-none ${lineClampClass}`}>
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              // Open links in new tab
              a: ({ node, ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline" />
              ),
            }}
          >
            {cleanText}
          </ReactMarkdown>
        </div>
      )}
      
      {/* Images section at the end */}
      {images.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Attached images:</p>
          <div className="space-y-2">
            {images.map((url, index) => (
              <div key={index} className="flex items-start gap-2 p-2 bg-accent/30 rounded-lg">
                <div className="flex-1 min-w-0">
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--primary)] hover:underline truncate block"
                  >
                    {url}
                  </a>
                </div>
                <img
                  src={url}
                  alt={`Attached ${index + 1}`}
                  className="w-16 h-16 object-cover rounded border flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
