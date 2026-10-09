/**
 * Dynamic favicon generator.
 *
 * Replaces static favicon files with an SVG favicon generated at runtime from
 * the project title. The favicon renders the project initials inside a disc
 * using the app's primary brand colour (Cransfield dark green).
 */

const BRAND_COLOR_HSL = "153 40% 32%";
const FALLBACK_TITLE = "Cransfield Materials Testing Center";

/** Extract initials from a multi-word title (up to 4 characters). */
export const getTitleInitials = (title: string): string => {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "CMTC";
  const initials = words.map((word) => word[0]?.toUpperCase() ?? "").join("");
  return initials.length >= 4 ? initials.slice(0, 4) : initials.padEnd(2, initials[0] ?? "C");
};

/** Escape a string for safe inclusion in SVG text content. */
const escapeSvgText = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Generate an SVG string for the favicon. */
export const generateFaviconSvg = (initials: string): string => {
  const safe = escapeSvgText(initials).slice(0, 4);
  const fontSize = Math.max(10, Math.min(20, 38 - 5 * (safe.length - 1)));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">` +
    `<rect width="48" height="48" rx="8" fill="hsl(${BRAND_COLOR_HSL})"/>` +
    `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"` +
    ` fill="white" font-family="Outfit, system-ui, sans-serif" font-weight="700" font-size="${fontSize}">` +
    safe +
    `</text></svg>`
  );
};

/** Convert an SVG string into a data URI. */
export const svgToDataUri = (svg: string): string => {
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27");
  return `data:image/svg+xml,${encoded}`;
};

/**
 * Set the document favicon to a dynamically generated SVG.
 * Call once at app startup, or whenever the project title changes.
 */
export const setDynamicFavicon = (title?: string): void => {
  if (typeof document === "undefined") return;

  const initials = getTitleInitials(title ?? FALLBACK_TITLE);
  const svg = generateFaviconSvg(initials);
  const dataUri = svgToDataUri(svg);

  const existing = document.querySelector('link[rel~="icon"]') as HTMLLinkElement | null;
  const link = existing ?? document.createElement("link");
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = dataUri;

  if (!existing) {
    const canonical = document.querySelector('link[rel~="canonical"]');
    (canonical?.parentNode ?? document.head).insertBefore(link, canonical?.parentNode ?? null);
    if (!canonical) document.head.appendChild(link);
  }
};

/** Remove any static favicon <link> tags and replace with the dynamic one. */
export const initDynamicFavicon = (title?: string): void => {
  document.querySelectorAll('link[rel~="icon"]').forEach((node) => node.remove());
  setDynamicFavicon(title);
};
