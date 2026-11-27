/** Notifies every open tab that letterhead artwork was uploaded or removed. */

const CHANNEL = "lab_admin_images_changed";
const bus = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;

export const emitAdminImagesChanged = (): void => {
  window.dispatchEvent(new Event(CHANNEL));
  bus?.postMessage("changed");
};

export const subscribeAdminImagesChanged = (listener: () => void): (() => void) => {
  window.addEventListener(CHANNEL, listener);
  const onMessage = () => listener();
  bus?.addEventListener("message", onMessage);
  return () => {
    window.removeEventListener(CHANNEL, listener);
    bus?.removeEventListener("message", onMessage);
  };
};
