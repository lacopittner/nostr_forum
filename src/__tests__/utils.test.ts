import { describe, it, expect } from 'vitest';

describe('Content Processing', () => {
  it('should format time ago correctly', () => {
    const now = Date.now() / 1000;
    
    // Just now
    expect(formatTimeAgo(now)).toBe('just now');
    
    // Minutes ago
    expect(formatTimeAgo(now - 300)).toBe('5m ago');
    
    // Hours ago
    expect(formatTimeAgo(now - 7200)).toBe('2h ago');
    
    // Days ago
    expect(formatTimeAgo(now - 172800)).toBe('2d ago');
  });

  it('should format numbers correctly', () => {
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1000)).toBe('1.0K');
    expect(formatNumber(1500)).toBe('1.5K');
    expect(formatNumber(1000000)).toBe('1.0M');
  });
});

// Simple implementations for testing
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toString();
}
