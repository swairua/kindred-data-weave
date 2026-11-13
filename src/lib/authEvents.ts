/**
 * Tiny auth-lost bus. `apiRequest` emits on any 401 returned mid-session so the
 * shell can send the user back to /login with a ?next= URL, regardless of which
 * page issued the failing call. Listeners can subscribe and unsubscribe; multiple
 * subscribers are allowed but the guard/shell owns the only one that navigates.
 */
const listeners = new Set<() => void>();

export const subscribeAuthLost = (callback: () => void): (() => void) => {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
};

export const emitAuthLost = () => {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // One broken listener must not stop the others (or the redirect) from running.
    }
  }
};
