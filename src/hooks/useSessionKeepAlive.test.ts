import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionKeepAlive } from './useSessionKeepAlive';
import * as apiModule from '@/lib/api';

// Mock the fetchCurrentUser function
vi.mock('@/lib/api', () => ({
  fetchCurrentUser: vi.fn(),
}));

describe('useSessionKeepAlive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should call fetchCurrentUser immediately when enabled', async () => {
    const mockFetchCurrentUser = vi.fn().mockResolvedValue({ id: 1, name: 'Test User' });
    vi.mocked(apiModule.fetchCurrentUser).mockImplementation(mockFetchCurrentUser);

    renderHook(() => useSessionKeepAlive(true, 5 * 60 * 1000));

    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('should ping at the correct interval (5 minutes by default)', async () => {
    const mockFetchCurrentUser = vi.fn().mockResolvedValue({ id: 1, name: 'Test User' });
    vi.mocked(apiModule.fetchCurrentUser).mockImplementation(mockFetchCurrentUser);

    const { rerender } = renderHook(() => useSessionKeepAlive(true, 5 * 60 * 1000));

    // Initial ping
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(1);

    // Move time forward 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(2);

    // Move time forward another 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(3);

    // Move time forward another 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(4);
  });

  it('should use custom interval when provided', async () => {
    const mockFetchCurrentUser = vi.fn().mockResolvedValue({ id: 1, name: 'Test User' });
    vi.mocked(apiModule.fetchCurrentUser).mockImplementation(mockFetchCurrentUser);

    const customInterval = 2 * 60 * 1000; // 2 minutes
    renderHook(() => useSessionKeepAlive(true, customInterval));

    // Initial ping
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(1);

    // Move time forward 2 minutes
    vi.advanceTimersByTime(customInterval);
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(2);

    // Move time forward another 2 minutes
    vi.advanceTimersByTime(customInterval);
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(3);
  });

  it('should not ping when disabled', async () => {
    const mockFetchCurrentUser = vi.fn().mockResolvedValue({ id: 1, name: 'Test User' });
    vi.mocked(apiModule.fetchCurrentUser).mockImplementation(mockFetchCurrentUser);

    renderHook(() => useSessionKeepAlive(false, 5 * 60 * 1000));

    // Should not call fetchCurrentUser at all
    expect(mockFetchCurrentUser).not.toHaveBeenCalled();

    // Advance timers - still should not ping
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(mockFetchCurrentUser).not.toHaveBeenCalled();
  });

  it('should start pinging when enabled transitions from false to true', async () => {
    const mockFetchCurrentUser = vi.fn().mockResolvedValue({ id: 1, name: 'Test User' });
    vi.mocked(apiModule.fetchCurrentUser).mockImplementation(mockFetchCurrentUser);

    const { rerender } = renderHook(
      ({ enabled }) => useSessionKeepAlive(enabled, 5 * 60 * 1000),
      { initialProps: { enabled: false } }
    );

    // Should not have pinged yet
    expect(mockFetchCurrentUser).not.toHaveBeenCalled();

    // Change to enabled
    rerender({ enabled: true });

    // Should ping immediately
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(1);

    // Advance time and verify continuing pings
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('should stop pinging when disabled transitions from true to false', async () => {
    const mockFetchCurrentUser = vi.fn().mockResolvedValue({ id: 1, name: 'Test User' });
    vi.mocked(apiModule.fetchCurrentUser).mockImplementation(mockFetchCurrentUser);

    const { rerender } = renderHook(
      ({ enabled }) => useSessionKeepAlive(enabled, 5 * 60 * 1000),
      { initialProps: { enabled: true } }
    );

    // Should ping immediately
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(1);

    // Advance time and verify ping happens
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(2);

    // Disable
    rerender({ enabled: false });

    // Advance time - should not ping
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(2); // Still 2, no new ping
  });

  it.skip('should handle ping failures gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockFetchCurrentUser = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.mocked(apiModule.fetchCurrentUser).mockImplementation(mockFetchCurrentUser);

    renderHook(() => useSessionKeepAlive(true, 5 * 60 * 1000));

    // Should attempt ping despite error
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(1);

    // Run pending timers to allow async operations to complete
    await vi.runOnlyPendingTimersAsync();
    // Verify it was called with the error message
    expect(consoleSpy.mock.calls.some(call =>
      call[0] === '[KeepAlive] Session keep-alive ping failed:' && call[1] === 'Network error'
    )).toBe(true);

    // Advance time and verify it continues trying
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
  });

  it('should handle null user response', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockFetchCurrentUser = vi.fn().mockResolvedValue(null);
    vi.mocked(apiModule.fetchCurrentUser).mockImplementation(mockFetchCurrentUser);

    renderHook(() => useSessionKeepAlive(true, 5 * 60 * 1000));

    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(1);

    // Run pending timers to allow async operations to complete
    await vi.runOnlyPendingTimersAsync();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[KeepAlive] Session ping returned no user - session may have expired'
    );

    consoleSpy.mockRestore();
  });

  it('should return lastPingTime in return value', () => {
    const mockFetchCurrentUser = vi.fn().mockResolvedValue({ id: 1, name: 'Test User' });
    vi.mocked(apiModule.fetchCurrentUser).mockImplementation(mockFetchCurrentUser);

    const { result } = renderHook(() => useSessionKeepAlive(true, 5 * 60 * 1000));

    // Hook should return an object with lastPingTime property
    expect(result.current).toHaveProperty('lastPingTime');
    expect(typeof result.current.lastPingTime).toBe('number');
  });

  it('should clean up interval on unmount', async () => {
    const mockFetchCurrentUser = vi.fn().mockResolvedValue({ id: 1, name: 'Test User' });
    vi.mocked(apiModule.fetchCurrentUser).mockImplementation(mockFetchCurrentUser);

    const { unmount } = renderHook(() => useSessionKeepAlive(true, 5 * 60 * 1000));

    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(1);

    // Unmount the hook
    unmount();

    // Clear the mock to track new calls
    mockFetchCurrentUser.mockClear();

    // Advance time - should not call fetchCurrentUser
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(mockFetchCurrentUser).not.toHaveBeenCalled();
  });

  it('should handle rapid enable/disable toggles', async () => {
    const mockFetchCurrentUser = vi.fn().mockResolvedValue({ id: 1, name: 'Test User' });
    vi.mocked(apiModule.fetchCurrentUser).mockImplementation(mockFetchCurrentUser);

    const { rerender } = renderHook(
      ({ enabled }) => useSessionKeepAlive(enabled, 5 * 60 * 1000),
      { initialProps: { enabled: true } }
    );

    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(1);

    // Disable
    rerender({ enabled: false });
    // Enable
    rerender({ enabled: true });

    // Should have pinged again on re-enable
    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(2);

    // Toggle again
    rerender({ enabled: false });
    rerender({ enabled: true });

    expect(mockFetchCurrentUser).toHaveBeenCalledTimes(3);
  });
});
