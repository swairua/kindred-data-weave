import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readRecord: vi.fn(),
  fetchAdminImagesAsBase64: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ readRecord: mocks.readRecord }));
vi.mock("@/lib/imageUtils", () => ({
  fetchAdminImagesAsBase64: mocks.fetchAdminImagesAsBase64,
}));

import {
  FALLBACK_COMPANY_DETAILS,
  fetchCompanyDetails,
  fetchReportBrand,
  formatCompanyAddress,
  formatCompanyPhones,
} from "@/lib/companyDetails";
import { generateReceptionAckPDF } from "@/lib/receptionAckPdfGenerator";

const companyRow = {
  id: 1,
  name: "Test Laboratorie",
  address_line1: "Box 1",
  address_line2: "Nairobi",
  address_line3: "",
  phone1: "+254 700",
  phone2: "+254 800",
  email: "lab@example.test",
  website: "https://lab.example.test",
};

const orgRow = {
  id: 1,
  legal_name: "Test Laboratorie Ltd",
  registration_number: "REG-1",
  tax_id: "TAX-1",
  industry: "Materials testing",
  headquarters_country: "Kenya",
  year_established: "2010",
};

beforeEach(() => {
  mocks.readRecord.mockReset();
  mocks.fetchAdminImagesAsBase64.mockReset();
  mocks.readRecord.mockImplementation(async (table: string) => ({
    data: table === "company_info" ? companyRow : table === "organisation_details" ? orgRow : null,
  }));
  mocks.fetchAdminImagesAsBase64.mockResolvedValue({ logo: "data:image/png;base64,AAAA" });
});

describe("dynamic company details", () => {
  it("maps company_info and organisation_details into one identity", async () => {
    const details = await fetchCompanyDetails();
    expect(details.name).toBe("Test Laboratorie");
    expect(details.legalName).toBe("Test Laboratorie Ltd");
    expect(details.addressLines).toEqual(["Box 1", "Nairobi"]);
    expect(details.registrationNumber).toBe("REG-1");
    expect(details.yearEstablished).toBe(2010);
    expect(formatCompanyAddress(details)).toBe("Box 1 · Nairobi");
    expect(formatCompanyPhones(details)).toBe("+254 700 · +254 800");
  });

  it("falls back gracefully when the settings tables are unavailable", async () => {
    mocks.readRecord.mockRejectedValue(new Error("offline"));
    const details = await fetchCompanyDetails();
    expect(details.name).toBe(FALLBACK_COMPANY_DETAILS.name);
    expect(details.email).toBe("");
  });

  it("loads header artwork and company identity together", async () => {
    const brand = await fetchReportBrand();
    expect(brand.images.logo).toContain("data:image");
    expect(brand.company.name).toBe("Test Laboratorie");
  });

  it("still returns an identity if the image fetch fails", async () => {
    mocks.fetchAdminImagesAsBase64.mockRejectedValue(new Error("image timeout"));
    const brand = await fetchReportBrand();
    expect(brand.images).toEqual({});
    expect(brand.company.name).toBe("Test Laboratorie");
  });

  it("prints the configured company identity in the acknowledgement letterhead", async () => {
    // No artwork uploaded: the typed identity from company_info becomes the letterhead.
    mocks.fetchAdminImagesAsBase64.mockResolvedValue({});
    const doc = await generateReceptionAckPDF({
      rcNo: "RC-TEST-1", jobNo: "TEST", client: "TEST", project: "TEST",
      clientRef: "", deliveredBy: "TEST", vehicleReg: "", receivedAt: "2026-11-27T10:00",
      methodSet: "", receivedBy: "Admin", storagePlan: "", status: "logged", samples: [],
      skipDownload: true,
    });
    const output = (doc.internal.pages as unknown as string[][])
      .flat()
      .filter((part) => typeof part === "string")
      .join("\n");
    expect(output).toContain("TEST LABORATORIE");
    expect(output).toContain("+254 700");
    expect(output).toContain("lab@example.test");
  });
});
