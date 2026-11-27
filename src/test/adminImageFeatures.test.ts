import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { jsPDF } from "jspdf";

import { addFittedImage } from "@/lib/pdfImageFit";
import { downloadAdminImage } from "@/lib/downloadAdminImage";
import { adminImagePreviewUrl } from "@/lib/imageUtils";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const realFetch = globalThis.fetch;
const realCreateObjectURL = globalThis.URL.createObjectURL;
const realRevokeObjectURL = globalThis.URL.revokeObjectURL;
let anchorClick: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  globalThis.URL.createObjectURL = vi.fn(() => "blob:test") as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    headers: { get: () => "image/jpeg" },
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.URL.createObjectURL = realCreateObjectURL;
  globalThis.URL.revokeObjectURL = realRevokeObjectURL;
  vi.restoreAllMocks();
});

describe("letterhead image behaviour", () => {
  it("fits artwork inside the reserved box without distorting it", () => {
    const addImage = vi.fn();
    const doc = {
      getImageProperties: () => ({ width: 100, height: 50 }),
      addImage,
    } as unknown as jsPDF;

    expect(addFittedImage(doc, PNG, "PNG", 10, 20, 60, 20)).toBe(true);
    // 100x50 scaled into 60x20 => 40x20, centred horizontally.
    expect(addImage).toHaveBeenCalledWith(PNG, "PNG", 20, 20, 40, 20, undefined, "FAST");
  });

  it("never throws on a corrupt image", () => {
    const doc = {
      getImageProperties: () => { throw new Error("bad image"); },
      addImage: vi.fn(),
    } as unknown as jsPDF;
    expect(addFittedImage(doc, "not-an-image", "PNG", 0, 0, 10, 10)).toBe(false);
  });

  it("downloads the current image with a sensible filename", async () => {
    const filename = await downloadAdminImage("logo", "2026-04-07", "my-logo.jpg");
    expect(filename).toBe("my-logo_logo.jpg");
    expect(anchorClick).toHaveBeenCalledTimes(1);
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toBe(adminImagePreviewUrl("logo", "2026-04-07"));
    expect(url).toContain("&v=2026-04-07");
  });

  it("reports an HTTP failure instead of downloading an error page", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
    await expect(downloadAdminImage("stamp", "v1")).rejects.toThrow("HTTP 401");
    expect(anchorClick).not.toHaveBeenCalled();
  });
});
