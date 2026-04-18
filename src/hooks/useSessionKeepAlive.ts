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
        console.log(`[KeepAlive] ${timestamp} Ping #${pingNumber} starting...`);
        const user = await fetchCurrentUser();
        if (user) {
          const now = Date.now();
          lastPingRef.current = now;
          console.log(`[KeepAlive] ${timestamp} ✓ Ping #${pingNumber} SUCCESS - user: ${user.name} (${user.email})`);
        } else {
          console.warn(`[KeepAlive] ${timestamp} ⚠️ Ping #${pingNumber} returned no user - session may have expired on backend`);
          console.warn("[KeepAlive] This could happen if:");
          console.warn("  1. Session timeout on backend");
          console.warn("  2. Backend session was manually cleared");
          console.warn("  3. API connection issue (but returned 401)");
          console.warn("[KeepAlive] User should be prompted to re-authenticate on next action");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[KeepAlive] ${timestamp} ✗ Ping #${pingNumber} FAILED:`, errorMsg);
        console.error("[KeepAlive] This could indicate:");
        console.error("  1. Network connectivity issue");
        console.error("  2. API server is unreachable");
        console.error("  3. Session token is invalid");
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
