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

/** Message shown when a user cancels a project write while presenting. */
export const DEMO_CANCEL_MESSAGE = "Project creation cancelled — demo mode is on.";

/**
 * Minimal safeguard for showcase sessions: demo mode changes branding only,
 * so a project created while it is on is a REAL record in the live database.
 * Nothing is filtered, sandboxed or auto-prefixed — the user is told this
 * plainly and can cancel before the write.
 */
export const confirmDemoProjectWrite = (): boolean => {
  if (!isDemoMode()) return true;
  if (typeof window === "undefined") return true;
  return window.confirm(
    "Demo mode is ON — projects are still saved to the LIVE database.\n\n" +
    "Demo mode only changes branding; it does not create a sandbox or filter data. " +
    "Use a clearly-marked name such as 'DEMO — DO NOT USE'.\n\n" +
    "Continue and save this project to the live database?",
  );
};

export class DemoProjectCancelled extends Error {
  constructor() {
    super(DEMO_CANCEL_MESSAGE);
    this.name = "DemoProjectCancelled";
  }
}

/** For async save paths that need cancellation to flow through their catch. */
export const assertDemoProjectWrite = (): void => {
  if (!confirmDemoProjectWrite()) throw new DemoProjectCancelled();
};
