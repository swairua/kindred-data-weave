import { useEffect, useState } from "react";
import { fetchAdminImagesAsBase64, type AdminImages } from "@/lib/imageUtils";
import { subscribeAdminImagesChanged } from "@/lib/adminImageEvents";

/** Shared base64 artwork source: the same fetch the PDF exporters use. */
let cached: AdminImages | null = null;
let cachedAt = 0;
let inFlight: Promise<AdminImages> | null = null;
const CACHE_MS = 30_000;

const load = (force = false): Promise<AdminImages> => {
  if (!force && cached && Date.now() - cachedAt < CACHE_MS) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = fetchAdminImagesAsBase64()
    .then((images) => {
      cached = images;
      cachedAt = Date.now();
      return images;
    })
    .catch(() => cached ?? {})
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

export const invalidateAdminImages = (): void => {
  cached = null;
  cachedAt = 0;
};

export const useAdminImages = (): AdminImages => {
  const [images, setImages] = useState<AdminImages>(cached ?? {});

  useEffect(() => {
    let active = true;
    const refresh = (force = false) => {
      void load(force).then((value) => {
        if (active) setImages(value);
      });
    };
    refresh();
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh(true);
    };
    const onChanged = () => refresh(true);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const unsubscribe = subscribeAdminImagesChanged(onChanged);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, []);

  return images;
};
