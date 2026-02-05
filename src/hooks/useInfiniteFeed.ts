import { useState, useEffect, useRef, useCallback } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { useNostr } from "../providers/NostrProvider";

interface UseInfiniteFeedOptions {
  kind: NDKKind;
  limit?: number;
  authors?: string[];
  tags?: Record<string, string[]>;
}

interface UseInfiniteFeedReturn {
  events: NDKEvent[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
}

export function useInfiniteFeed(options: UseInfiniteFeedOptions): UseInfiniteFeedReturn {
  const { ndk } = useNostr();
  const { kind, limit = 20, authors, tags } = options;
  
  const [events, setEvents] = useState<NDKEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const seenEventIds = useRef(new Set<string>());
  const lastEventTime = useRef<number | undefined>(undefined);
  const subscriptionRef = useRef<any>(null);
  const isInitialLoad = useRef(true);

  // Build filter
  const buildFilter = useCallback((until?: number) => {
    const filter: any = { 
      kinds: [kind], 
      limit,
      ...(until && { until })
    };
    
    if (authors?.length) {
      filter.authors = authors;
    }
    
    if (tags) {
      Object.entries(tags).forEach(([key, values]) => {
        filter[`#${key}`] = values;
      });
    }
    
    return filter;
  }, [kind, limit, authors, tags]);

  // Initial load
  useEffect(() => {
    if (!ndk) return;
    
    setIsLoading(true);
    setError(null);
    seenEventIds.current.clear();
    lastEventTime.current = undefined;
    
    const filter = buildFilter();
    
    // Use fetchEvents instead of subscribe for initial load
    ndk.fetchEvents(filter, { closeOnEose: true })
      .then((fetchedEvents) => {
        const uniqueEvents = Array.from(fetchedEvents)
          .filter(event => {
            if (seenEventIds.current.has(event.id)) return false;
            seenEventIds.current.add(event.id);
            return true;
          })
          .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        
        setEvents(uniqueEvents);
        
        // Set last event time for pagination
        if (uniqueEvents.length > 0) {
          lastEventTime.current = uniqueEvents[uniqueEvents.length - 1].created_at;
        }
        
        // If we got fewer events than limit, there's no more
        setHasMore(uniqueEvents.length >= limit);
        setIsLoading(false);
        isInitialLoad.current = false;
        
        // Subscribe to new events after initial load
        subscribeToNewEvents();
      })
      .catch((err) => {
        console.error("Failed to fetch events:", err);
        setError("Failed to load posts. Please try again.");
        setIsLoading(false);
      });
    
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.stop();
      }
    };
  }, [ndk, buildFilter]);

  // Subscribe to new events (real-time updates)
  const subscribeToNewEvents = useCallback(() => {
    if (!ndk) return;
    
    // Only subscribe to events newer than what we have
    const since = events[0]?.created_at || Math.floor(Date.now() / 1000);
    
    const filter = buildFilter();
    filter.since = since;
    
    const sub = ndk.subscribe(filter, { closeOnEose: false });
    
    sub.on("event", (event: NDKEvent) => {
      if (seenEventIds.current.has(event.id)) return;
      seenEventIds.current.add(event.id);
      
      setEvents(prev => {
        // Insert in correct position (sorted by time)
        const newEvents = [...prev, event];
        return newEvents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      });
    });
    
    subscriptionRef.current = sub;
  }, [ndk, buildFilter, events]);

  // Load more (pagination)
  const loadMore = useCallback(async () => {
    if (!ndk || isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    
    const until = lastEventTime.current;
    if (!until) {
      setIsLoadingMore(false);
      return;
    }
    
    const filter = buildFilter(until - 1); // -1 to exclude the last event
    
    try {
      const fetchedEvents = await ndk.fetchEvents(filter, { closeOnEose: true });
      
      const uniqueEvents = Array.from(fetchedEvents)
        .filter(event => {
          if (seenEventIds.current.has(event.id)) return false;
          seenEventIds.current.add(event.id);
          return true;
        })
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      
      if (uniqueEvents.length === 0) {
        setHasMore(false);
      } else {
        setEvents(prev => [...prev, ...uniqueEvents]);
        lastEventTime.current = uniqueEvents[uniqueEvents.length - 1].created_at;
        setHasMore(uniqueEvents.length >= limit);
      }
    } catch (err) {
      console.error("Failed to load more events:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [ndk, buildFilter, isLoadingMore, hasMore, limit]);

  // Refresh
  const refresh = useCallback(() => {
    seenEventIds.current.clear();
    lastEventTime.current = undefined;
    setEvents([]);
    setHasMore(true);
    isInitialLoad.current = true;
    
    // Trigger re-fetch
    if (subscriptionRef.current) {
      subscriptionRef.current.stop();
    }
  }, []);

  return {
    events,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh
  };
}