// Content processing utilities for Nostr posts
import { ReactNode } from "react";

const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const IMAGE_REGEX = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg))/gi;
const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
const NOSTR_MENTION_REGEX = /(?:nostr:)?(npub1[ac-hj-np-z02-9]{58})/g;
const HASHTAG_REGEX = /#(\w+)/g;

export interface ProcessedContent {
  text: ReactNode[];
  images: string[];
  videos: Array<{ type: "youtube"; id: string }>;
  links: string[];
}

export function processContent(content: string): ProcessedContent {
  const images: string[] = [];
  const videos: Array<{ type: "youtube"; id: string }> = [];
  const links: string[] = [];

  // Extract images
  const imageMatches = content.match(IMAGE_REGEX);
  if (imageMatches) {
    images.push(...imageMatches);
  }

  // Extract YouTube videos
  let match;
  while ((match = YOUTUBE_REGEX.exec(content)) !== null) {
    videos.push({ type: "youtube", id: match[1] });
  }

  // Extract all links
  const linkMatches = content.match(URL_REGEX);
  if (linkMatches) {
    links.push(...linkMatches.filter(link => !images.includes(link)));
  }

  // Process text with highlights
  const text = parseText(content);

  return { text, images, videos, links };
}

function parseText(content: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  // Combined regex for all patterns
  const combinedRegex = new RegExp(
    `(${IMAGE_REGEX.source}|${NOSTR_MENTION_REGEX.source}|${HASHTAG_REGEX.source}|${URL_REGEX.source})`,
    'gi'
  );

  let match;
  while ((match = combinedRegex.exec(content)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {content.slice(lastIndex, match.index)}
        </span>
      );
    }

    const matched = match[0];

    // Check what type of match
    if (IMAGE_REGEX.test(matched)) {
      // Skip images in text (they're rendered separately)
      parts.push(
        <span key={`img-${match.index}`} className="text-[var(--primary)] text-sm italic">
          [image]
        </span>
      );
    } else if (NOSTR_MENTION_REGEX.test(matched)) {
      const npub = matched.replace('nostr:', '');
      parts.push(
        <a
          key={`mention-${match.index}`}
          href={`/profile/${npub}`}
          className="text-[var(--primary)] hover:underline font-medium"
          onClick={(e) => {
            e.preventDefault();
            // Navigate programmatically
            window.location.href = `/profile/${npub}`;
          }}
        >
          {npub.slice(0, 8)}...{npub.slice(-4)}
        </a>
      );
    } else if (HASHTAG_REGEX.test(matched)) {
      const tag = matched.slice(1);
      parts.push(
        <a
          key={`tag-${match.index}`}
          href={`/search?q=${tag}`}
          className="text-[var(--primary)] hover:underline"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = `/search?q=${tag}`;
          }}
        >
          {matched}
        </a>
      );
    } else if (URL_REGEX.test(matched)) {
      parts.push(
        <a
          key={`link-${match.index}`}
          href={matched}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--primary)] hover:underline break-all"
        >
          {matched.length > 50 ? matched.slice(0, 50) + '...' : matched}
        </a>
      );
    }

    lastIndex = match.index + matched.length;
    
    // Reset regex lastIndex for next iteration
    IMAGE_REGEX.lastIndex = 0;
    NOSTR_MENTION_REGEX.lastIndex = 0;
    HASHTAG_REGEX.lastIndex = 0;
    URL_REGEX.lastIndex = 0;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(
      <span key={`text-end`}>{content.slice(lastIndex)}</span>
    );
  }

  return parts;
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp * 1000) / 1000);
  
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toString();
}

export function nip19ToHex(nip19: string): string | null {
  try {
    // Simple check - npub1 prefix means we need to decode
    if (nip19.startsWith('npub1')) {
      // This is a simplified version - in production use proper bech32 decoding
      return null;
    }
    // Assume it's already hex
    return nip19;
  } catch {
    return null;
  }
}
