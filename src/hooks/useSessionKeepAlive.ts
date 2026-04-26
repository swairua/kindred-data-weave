import { useEffect, useRef } from 'react';
import { fetchCurrentUser } from '@/lib/api';

/**
 * Hook to keep the user session alive by periodically pinging the backend
 * This prevents session timeout during active work sessions
 * 
 * @param enabled - Whether keep-alive is enabled (typically true if user is authenticated)
 * @param intervalMs - How often to ping (default: 5 minutes)
 */
export const useSessionKeepAlive = (enabled: boolean = true, intervalMs: number = 5 * 60 * 1000) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPingRef = useRef<number>(0);
  const pingCountRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      // Clean up interval if keep-alive is disabled
      if (intervalRef.current) {
        const timestamp = new Date().toISOString();
        console.log(`[KeepAlive] ${timestamp} Disabling session keep-alive (${pingCountRef.current} pings completed)`);
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const ping = async () => {
      const timestamp = new Date().toISOString();
      pingCountRef.current += 1;
      const pingNumber = pingCountRef.current;

      try {
        console.debug(`[KeepAlive] ${timestamp} Ping #${pingNumber} starting...`);
        const user = await fetchCurrentUser();
        if (user) {
          const now = Date.now();
          lastPingRef.current = now;
          console.debug(`[KeepAlive] ${timestamp} ✓ Ping #${pingNumber} SUCCESS - user: ${user.name} (${user.email})`);
        } else {
          // 401 or session expired - this is handled gracefully in fetchCurrentUser
          console.debug(`[KeepAlive] ${timestamp} Ping #${pingNumber} - user not authenticated (expected for session expiry)`);
        }
      } catch (error) {
        // Silently ignore network errors in keep-alive pings since it's a background task
        // These errors are logged by the apiRequest function already
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Only log as warning if it looks like a real error (not just network blip)
        if (errorMsg.includes("401") || errorMsg.includes("Unauthorized")) {
          console.warn(`[KeepAlive] ${timestamp} Session may have expired (401 response)`);
        } else if (!errorMsg.includes("Failed to fetch") && !errorMsg.includes("Unable to reach")) {
          // Log unexpected errors, but not generic network errors (which are common in background tasks)
          console.debug(`[KeepAlive] ${timestamp} Ping #${pingNumber} network error (retrying in ${(intervalMs / 1000 / 60).toFixed(1)} minutes):`, errorMsg);
        }
      }
    };

    // Initial ping immediately when enabled
    const timestamp = new Date().toISOString();
    console.log(`[KeepAlive] ${timestamp} Starting session keep-alive (interval: ${(intervalMs / 1000 / 60).toFixed(1)} minutes)`);
    ping();

    // Set up periodic pings
    intervalRef.current = setInterval(ping, intervalMs);

    return () => {
      // Cleanup on unmount or when enabled changes
      if (intervalRef.current) {
        const cleanupTimestamp = new Date().toISOString();
        console.log(`[KeepAlive] ${cleanupTimestamp} Cleaning up keep-alive interval (${pingCountRef.current} pings sent)`);
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs]);

  return {
    lastPingTime: lastPingRef.current,
  };
};
