import { useState, useCallback, useRef } from "react";
import { useToast } from "../lib/toast";

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  cooldownMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxAttempts: 5,      // 5 attempts
  windowMs: 60000,     // per 1 minute
  cooldownMs: 30000,   // 30s cooldown after limit
};

export function useRateLimit(actionName: string, config: Partial<RateLimitConfig> = {}) {
  const { maxAttempts, windowMs, cooldownMs } = { ...DEFAULT_CONFIG, ...config };
  const { error: showError } = useToast();
  
  const attemptsRef = useRef<number[]>([]);
  const [isCooldown, setIsCooldown] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(maxAttempts);

  const checkRateLimit = useCallback(() => {
    const now = Date.now();
    
    // Remove old attempts outside the window
    attemptsRef.current = attemptsRef.current.filter(
      timestamp => now - timestamp < windowMs
    );
    
    // Check if in cooldown
    if (isCooldown) {
      const lastAttempt = attemptsRef.current[attemptsRef.current.length - 1];
      if (lastAttempt && now - lastAttempt < cooldownMs) {
        const remainingCooldown = Math.ceil((cooldownMs - (now - lastAttempt)) / 1000);
        showError(`Please wait ${remainingCooldown}s before ${actionName} again`);
        return false;
      }
      setIsCooldown(false);
    }
    
    // Check if limit reached
    if (attemptsRef.current.length >= maxAttempts) {
      setIsCooldown(true);
      const cooldownSeconds = Math.ceil(cooldownMs / 1000);
      showError(`Rate limit reached. Please wait ${cooldownSeconds}s before ${actionName} again`);
      return false;
    }
    
    // Add attempt
    attemptsRef.current.push(now);
    setRemainingAttempts(maxAttempts - attemptsRef.current.length);
    return true;
  }, [maxAttempts, windowMs, cooldownMs, actionName, showError, isCooldown]);

  const resetLimit = useCallback(() => {
    attemptsRef.current = [];
    setIsCooldown(false);
    setRemainingAttempts(maxAttempts);
  }, [maxAttempts]);

  return {
    checkRateLimit,
    resetLimit,
    isCooldown,
    remainingAttempts,
  };
}
