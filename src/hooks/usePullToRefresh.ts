import { useState, useEffect, useCallback, useRef } from "react";

interface PullToRefreshState {
  isPulling: boolean;
  pullDistance: number;
  isRefreshing: boolean;
}

export function usePullToRefresh(
  onRefresh: () => Promise<void> | void,
  enabled: boolean = true
) {
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    pullDistance: 0,
    isRefreshing: false,
  });

  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const isAtTop = useRef(true);
  const pullStartTime = useRef<number | null>(null);

  // Check if at top of page
  const checkIsAtTop = useCallback(() => {
    isAtTop.current = window.scrollY <= 10;
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", checkIsAtTop);
    return () => window.removeEventListener("scroll", checkIsAtTop);
  }, [checkIsAtTop]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || state.isRefreshing) return;

    checkIsAtTop();
    if (!isAtTop.current) return;

    const touch = e.touches[0];
    touchStartY.current = touch.clientY;
    touchStartX.current = touch.clientX;
    pullStartTime.current = Date.now();
  }, [enabled, state.isRefreshing, checkIsAtTop]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || state.isRefreshing) return;
    if (touchStartY.current === null || touchStartX.current === null) return;
    if (!isAtTop.current) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartY.current;
    const deltaX = Math.abs(touch.clientX - touchStartX.current);

    // Prevent horizontal scroll from triggering pull
    if (deltaX > deltaY) return;

    // Only pull down (positive deltaY)
    if (deltaY > 0) {
      // Resistance increases as you pull further
      const resistance = 0.5;
      const pullDistance = Math.min(deltaY * resistance, 100);

      setState((prev) => ({
        ...prev,
        isPulling: true,
        pullDistance,
      }));

      // Prevent default scrolling
      if (pullDistance > 0) {
        e.preventDefault();
      }
    }
  }, [enabled, state.isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!enabled) return;
    if (touchStartY.current === null) return;

    const pullDuration = pullStartTime.current ? Date.now() - pullStartTime.current : 0;

    // Trigger refresh if pulled far enough and quickly enough
    if (state.pullDistance > 60 && pullDuration < 500) {
      setState((prev) => ({ ...prev, isRefreshing: true }));

      try {
        await onRefresh();
      } finally {
        setState({
          isPulling: false,
          pullDistance: 0,
          isRefreshing: false,
        });
      }
    } else {
      // Reset without refreshing
      setState({
        isPulling: false,
        pullDistance: 0,
        isRefreshing: false,
      });
    }

    touchStartY.current = null;
    touchStartX.current = null;
    pullStartTime.current = null;
  }, [enabled, state.pullDistance, onRefresh]);

  useEffect(() => {
    // Only enable on touch devices
    if (!("ontouchstart" in window)) return;

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return state;
}
