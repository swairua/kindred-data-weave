import { useEffect, useRef, useCallback } from 'react';
import { fetchCurrentUser } from '@/lib/api';

/**
 * Hook to keep the user session alive by periodically pinging the backend
 * This prevents session timeout during active work sessions
 *
 * @param enabled - Whether keep-alive is enabled (typically true if user is authenticated)
 * @param onSessionExpired - Callback when session is detected as expired
 * @param intervalMs - How often to ping (default: 5 minutes)
 */
export const useSessionKeepAlive = (
  enabled: boolean = true,
  onSessionExpired?: () => void,
  intervalMs: number = 5 * 60 * 1000
) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPingRef = useRef<number>(0);
  const sessionValidRef = useRef<boolean>(true);

  useEffect(() => {
    if (!enabled) {
      // Clean up interval if keep-alive is disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      sessionValidRef.current = true;
      return;
    }

    const ping = async () => {
      try {
        const user = await fetchCurrentUser();
        if (user) {
          const now = Date.now();
          lastPingRef.current = now;
          // If session was previously invalid, it's now valid again
          if (!sessionValidRef.current) {
            sessionValidRef.current = true;
            console.log('[KeepAlive] Session restored');
          }
          console.debug(`[KeepAlive] Session ping successful at ${new Date(now).toLocaleTimeString()}`);
        } else {
          console.warn('[KeepAlive] Session ping returned no user - session has expired');
          if (sessionValidRef.current) {
            sessionValidRef.current = false;
            onSessionExpired?.();
          }
        }
      } catch (error) {
        console.warn('[KeepAlive] Session keep-alive ping failed:', error instanceof Error ? error.message : error);
        // On network errors, don't mark session as invalid - it could be a temporary issue
      }
    };

    // Initial ping immediately when enabled
    console.log('[KeepAlive] Starting session keep-alive (interval:', (intervalMs / 1000 / 60).toFixed(1), 'minutes)');
    ping();

    // Set up periodic pings
    intervalRef.current = setInterval(ping, intervalMs);

    return () => {
      // Cleanup on unmount or when enabled changes
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, onSessionExpired]);

  return {
    lastPingTime: lastPingRef.current,
    isSessionValid: sessionValidRef.current,
  };
};
