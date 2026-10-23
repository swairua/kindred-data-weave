/**
 * Stamp image utilities: convert stamp images to PNG with transparent
 * background so they embed cleanly in PDF reports.
 */

/** Default color-distance threshold (Euclidean in RGB space, 0-255 scale). */
const DEFAULT_THRESHOLD = 30;
/** Downscale very large stamps to keep processing fast. */
const MAX_DIMENSION = 2000;

/**
 * Load a File/Blob into an HTMLImageElement.
 */
const loadImage = (source: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(source);
  });

/**
 * Find the most frequent color among a list of [r,g,b,a] samples.
 */
const mostFrequentColor = (samples: number[][]): [number, number, number] => {
  const counts = new Map<string, { count: number; color: [number, number, number] }>();
  for (const s of samples) {
    const key = `${Math.round(s[0] / 8) * 8},${Math.round(s[1] / 8) * 8},${Math.round(s[2] / 8) * 8}`;
    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      counts.set(key, { count: 1, color: [s[0], s[1], s[2]] });
    }
  }
  let best = { count: 0, color: [255, 255, 255] as [number, number, number] };
  for (const entry of counts.values()) {
    if (entry.count > best.count) best = entry;
  }
  return best.color;
};

/**
 * Convert a stamp image (File or Blob) to a PNG Blob with transparent
 * background. The background color is detected by sampling the four corners
 * of the image. Pixels within `threshold` Euclidean distance of that color
 * become fully transparent.
 *
 * Returns the original blob unchanged if it is already a transparent PNG
 * (detected by checking for any pixel with alpha < 255).
 */
export async function makeStampTransparent(
  source: Blob,
  threshold: number = DEFAULT_THRESHOLD,
): Promise<Blob> {
  // Already PNG? Quick check for existing transparency.
  if (source.type === "image/png") {
    try {
      const img = await loadImage(source);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return source;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let hasAlpha = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          hasAlpha = true;
          break;
        }
      }
      if (hasAlpha) {
        URL.revokeObjectURL(img.src);
        return source; // Already transparent, pass through.
      }
    } catch {
      // Fall through to processing.
    }
  }

  const img = await loadImage(source);
  let w = img.width;
  let h = img.height;

  // Downscale large images.
  if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(img.src);
    return source;
  }
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Sample corners (and inset points for stamps with borders).
  const inset = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const samplePoints = [
    [inset, inset],
    [w - 1 - inset, inset],
    [inset, h - 1 - inset],
    [w - 1 - inset, h - 1 - inset],
    [Math.round(w / 2), inset],
    [inset, Math.round(h / 2)],
  ];
  const samples = samplePoints.map(([x, y]) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  });

  const bgColor = mostFrequentColor(samples);

  // Make matching pixels transparent.
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bgColor[0];
    const dg = data[i + 1] - bgColor[1];
    const db = data[i + 2] - bgColor[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= threshold) {
      data[i + 3] = 0;
    } else if (dist <= threshold * 1.5) {
      // Soft edge: partial transparency for smoother borders.
      const alpha = Math.round(((dist - threshold) / (threshold * 0.5)) * 255);
      data[i + 3] = Math.min(data[i + 3], alpha);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  URL.revokeObjectURL(img.src);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
      "image/png",
    );
  });
}

/**
 * Convert a stamp Blob to a transparent PNG data URL.
 * Returns undefined on failure.
 */
export async function stampBlobToTransparentDataUrl(blob: Blob): Promise<string | undefined> {
  try {
    const pngBlob = await makeStampTransparent(blob);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(pngBlob);
    });
  } catch {
    return undefined;
  }
}
