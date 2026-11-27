/**
 * Opt-in demo branding.
 *
 * Demo mode changes identity only — company details and the three letterhead
 * images — and deliberately does NOT touch data retrieval. Every list/read in
 * the app keeps talking to the live API, so sample branding can be layered on
 * top of real records for demonstrations without changing what is fetched.
 *
 * The flag is per browser (localStorage) and off by default: a report printed
 * by an unsuspecting user must never carry DEMO branding.
 */

const STORAGE_KEY = "lab_demo_mode_v1";
const EVENT = "lab_demo_mode_changed";
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(EVENT) : null;

export const isDemoMode = (): boolean => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const setDemoMode = (enabled: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* storage disabled: the in-memory flag still changes this tab */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT));
  }
  channel?.postMessage(enabled ? "on" : "off");
};

export const subscribeDemoModeChanged = (listener: () => void): (() => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, listener);
  const onMessage = () => listener();
  channel?.addEventListener("message", onMessage);
  return () => {
    window.removeEventListener(EVENT, listener);
    channel?.removeEventListener("message", onMessage);
  };
};
