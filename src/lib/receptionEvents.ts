/**
 * Tiny event bus for reception-load failures. API-layer code emits potential
 * problems here so pages can render a banner instead of silently showing an
 * empty list — mirrors the auth-lost pattern in `authEvents`.
 */
export type ReceptionLoadEvent = {
  kind: "consignments" | "photos" | "connectivity" | "acknowledgement";
  message: string;
};

type ReceptionLoadListener = (event: ReceptionLoadEvent) => void;

const listeners = new Set<ReceptionLoadListener>();

export const subscribeReceptionLoad = (cb: ReceptionLoadListener): (() => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

export const emitReceptionLoad = (event: ReceptionLoadEvent): void => {
  for (const cb of [...listeners]) {
    try { cb(event); } catch { /* one broken listener must not stop the others */ }
  }
};
