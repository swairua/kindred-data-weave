import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readRecord: vi.fn(),
  listRecords: vi.fn(),
  addFittedImage: vi.fn(() => true),
}));

vi.mock("@/lib/api", () => ({ readRecord: mocks.readRecord, listRecords: mocks.listRecords }));
vi.mock("@/lib/pdfImageFit", () => ({ addFittedImage: mocks.addFittedImage }));

import { DEMO_COMPANY, getDemoImages } from "@/lib/demoBrand";
import {
  assertDemoProjectWrite,
  confirmDemoProjectWrite,
  DemoProjectCancelled,
  isDemoMode,
  setDemoMode,
} from "@/lib/demoMode";
import { fetchCompanyDetails, fetchReportBrand } from "@/lib/companyDetails";
import { fetchAdminImagesAsBase64 } from "@/lib/imageUtils";
import { generateReceptionAckPDF } from "@/lib/receptionAckPdfGenerator";

beforeEach(() => {
  setDemoMode(false);
  mocks.readRecord.mockReset();
  mocks.listRecords.mockReset();
  mocks.readRecord.mockResolvedValue({ data: { id: 1, name: "REAL LAB" } });
  mocks.listRecords.mockResolvedValue({ data: [] });
});

afterEach(() => {
  setDemoMode(false);
  vi.restoreAllMocks();
});

describe("demo mode", () => {
  it("is off by default and still reads the real settings", async () => {
    expect(isDemoMode()).toBe(false);
    const company = await fetchCompanyDetails();
    expect(company.name).toBe("REAL LAB");
    expect(mocks.readRecord).toHaveBeenCalled();
  });

  it("returns the built-in sample identity without touching the settings tables", async () => {
    setDemoMode(true);
    expect(isDemoMode()).toBe(true);
    const company = await fetchCompanyDetails();
    expect(company.name).toBe(DEMO_COMPANY.name);
    expect(company.email).toBe("demo@example.invalid");
    expect(mocks.readRecord).not.toHaveBeenCalled();
  });

  it("returns generated demo artwork without querying admin_images", async () => {
    setDemoMode(true);
    const images = await fetchAdminImagesAsBase64();
    for (const key of ["logo", "contacts", "stamp"] as const) {
      expect(images[key]).toMatch(/^data:image\//);
    }
    expect(mocks.listRecords).not.toHaveBeenCalled();
  });

  it("gives every report the demo brand in one pass", async () => {
    setDemoMode(true);
    const brand = await fetchReportBrand();
    expect(brand.company.name).toBe(DEMO_COMPANY.name);
    expect(brand.images.logo).toMatch(/^data:image\//);
    expect(mocks.readRecord).not.toHaveBeenCalled();
    expect(mocks.listRecords).not.toHaveBeenCalled();
  });

  it("feeds demo artwork into a generated acknowledgement", async () => {
    setDemoMode(true);
    mocks.addFittedImage.mockClear();
    await generateReceptionAckPDF({
      rcNo: "RC-DEMO-1", jobNo: "DEMO", client: "DEMO", project: "DEMO", clientRef: "",
      deliveredBy: "DEMO", vehicleReg: "", receivedAt: "2026-11-27T10:00", methodSet: "",
      receivedBy: "Admin", storagePlan: "", status: "logged", samples: [], skipDownload: true,
    });
    const demo = getDemoImages();
    const placed = mocks.addFittedImage.mock.calls.map((call) => call[1]);
    expect(placed).toContain(demo.logo?.split(",")[1]);
    expect(placed).toContain(demo.contacts?.split(",")[1]);
    expect(mocks.readRecord).not.toHaveBeenCalled();
  });

  it("does not prompt for project writes when demo mode is off", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    expect(confirmDemoProjectWrite()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(() => assertDemoProjectWrite()).not.toThrow();
  });

  it("warns before a demo-mode project write and lets the user cancel", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    setDemoMode(true);
    expect(confirmDemoProjectWrite()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain("LIVE database");
    expect(() => assertDemoProjectWrite()).toThrow(DemoProjectCancelled);
  });

  it("proceeds with the write when the user accepts the demo warning", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setDemoMode(true);
    expect(confirmDemoProjectWrite()).toBe(true);
    expect(() => assertDemoProjectWrite()).not.toThrow();
  });
});
