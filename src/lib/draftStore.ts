/**
 * Namespaced, JSON-safe draft store with one canonical prefix.
 *
 * Why this exists: every test used to invent its own localStorage key
 * ("atterbergProjectState", "enhancedAtterbergTests", "atterberg_selection",
 * "lab_project_prefs", etc.), so clearing or debugging stale drafts required
 * an admin page to enumerate them all. The store below provides the two
 * operations every call site needs and silently coerces bad payloads to fallback.
 */
const DRAFT_PREFIX = "lab_draft:";
const DRAFT_VERSION_KEY = "lab_draft:__version";
const DRAFT_VERSION = 1;

const keyFor = (name: string) => `${DRAFT_PREFIX}${name.replace(/^lab_draft:/, "")}`;

/** True once per session if the draft format was reset to a new version. */
export const consumeDraftVersionBump = (): boolean => {
  try {
    const marker = window.localStorage.getItem(DRAFT_VERSION_KEY);
    if (marker !== String(DRAFT_VERSION)) {
      window.localStorage.setItem(DRAFT_VERSION_KEY, String(DRAFT_VERSION));
      return marker !== null && marker !== String(DRAFT_VERSION);
    }
  } catch {
    // storage unavailable (private mode, quota) — skip the bump check
  }
  return false;
};

export const loadDraft = <T,>(name: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(keyFor(name));
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
};

export const saveDraft = (name: string, value: unknown): boolean => {
  try {
    window.localStorage.setItem(keyFor(name), JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`[DraftStore] Failed to persist ${keyFor(name)}:`, error);
    return false;
  }
};

export const removeDraft = (name: string): void => {
  try {
    window.localStorage.removeItem(keyFor(name));
  } catch {
    // ignore
  }
};
