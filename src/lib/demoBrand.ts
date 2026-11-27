/**
 * Built-in sample identity for demo mode.
 *
 * The artwork is drawn in code rather than shipped as binary files, so the
 * demo profile cannot drift out of the repo and needs no server storage. The
 * marks are deliberately unmistakable: anything printed while demo mode is on
 * must be obviously a sample, not a report that could be mistaken for real.
 */
import type { CompanyDetails } from "./companyDetails";
import type { AdminImages } from "./imageUtils";

export const DEMO_COMPANY: CompanyDetails = {
  name: "DEMO LABORATORY (SAMPLE)",
  legalName: "Demo Laboratory Sample Ltd",
  addressLines: ["Sample House, Demo Street", "P.O. Box 00000, Nairobi"],
  phone1: "+254 700 000 000",
  phone2: "+254 800 000 000",
  email: "demo@example.invalid",
  website: "https://demo.example.invalid",
  registrationNumber: "DEMO-0001",
  taxId: "DEMO-TAX-0001",
  industry: "Demo Materials Testing",
  headquartersCountry: "Kenya",
  yearEstablished: 2026,
};

const FALLBACK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

type Painter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

const drawPng = (width: number, height: number, paint: Painter): string => {
  try {
    if (typeof document === "undefined") return FALLBACK_PNG;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return FALLBACK_PNG;
    paint(ctx, width, height);
    return canvas.toDataURL("image/png");
  } catch {
    return FALLBACK_PNG;
  }
};

let cached: AdminImages | null = null;

/** Memoised: generating the same data URLs on every render/export is wasteful. */
export const getDemoImages = (): AdminImages => {
  if (cached) return cached;

  cached = {
    logo: drawPng(620, 200, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#6d28d9";
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = "#6d28d9";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 62px sans-serif";
      ctx.fillText("DEMO LABORATORY", w / 2, h / 2 - 20);
      ctx.font = "bold 30px sans-serif";
      ctx.fillText("SAMPLE - NOT FOR REPORTING", w / 2, h / 2 + 44);
    }),

    contacts: drawPng(620, 200, (ctx, w, h) => {
      ctx.fillStyle = "#fffbeb";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = "#92400e";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 34px sans-serif";
      ctx.fillText("DEMO LABORATORY", 24, 38);
      ctx.font = "24px sans-serif";
      ctx.fillText("Sample House, Demo Street, Nairobi", 24, 82);
      ctx.fillText("Tel: +254 700 000 000", 24, 118);
      ctx.fillText("demo@example.invalid  -  demo.example.invalid", 24, 152);
    }),

    stamp: drawPng(300, 300, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "#6d28d9";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#6d28d9";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 78px sans-serif";
      ctx.fillText("DEMO", w / 2, h / 2 - 26);
      ctx.font = "bold 34px sans-serif";
      ctx.fillText("NOT VALID", w / 2, h / 2 + 54);
    }),
  };

  return cached;
};
