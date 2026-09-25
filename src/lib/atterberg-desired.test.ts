import { describe, expect, it } from "vitest";
import type { AtterbergRecord } from "@/context/TestDataContext";

const record = {
  id: "rec-desired",
  title: "Record 1",
  label: "TP 02",
  sampleNumber: "-",
  dateTested: "26 Jul 2026, 12:38 pm",
  dateSubmitted: "26 Jul 2026, 12:38 pm",
  testedBy: "A. Waweru",
  passing425um: "92",
  note: "",
  isExpanded: true,
  results: {},
  tests: [
    {
      id: "ll", title: "LL", isExpanded: true, result: {}, type: "liquidLimit",
      trials: [
        { id: "1", trialNo: "1", penetration: "16.4", containerNo: "C1", containerWetMass: "25.8", containerDryMass: "16.36", containerMass: "", moisture: "57.7" },
        { id: "2", trialNo: "2", penetration: "17.8", containerNo: "C2", containerWetMass: "25.7", containerDryMass: "16.1", containerMass: "", moisture: "59.63" },
        { id: "3", trialNo: "3", penetration: "19.9", containerNo: "C3", containerWetMass: "23.5", containerDryMass: "14.5", containerMass: "", moisture: "62.07" },
        { id: "4", trialNo: "4", penetration: "22.1", containerNo: "C4", containerWetMass: "30.1", containerDryMass: "18.39", containerMass: "", moisture: "63.68" },
        { id: "5", trialNo: "5", penetration: "24.1", containerNo: "C5", containerWetMass: "22.4", containerDryMass: "13.47", containerMass: "", moisture: "66.3" },
      ],
    },
    {
      id: "pl", title: "PL", isExpanded: true, result: {}, type: "plasticLimit",
      trials: [
        { id: "6", trialNo: "1", containerNo: "C6", containerWetMass: "10.7", containerDryMass: "7.5", containerMass: "", moisture: "42.67" },
        { id: "7", trialNo: "2", containerNo: "C7", containerWetMass: "10.8", containerDryMass: "7.55", containerMass: "", moisture: "43.05" },
      ],
    },
    {
      id: "sl", title: "SL", isExpanded: true, result: {}, type: "shrinkageLimit",
      trials: [{ id: "8", trialNo: "1", initialLength: "140", finalLength: "124" }],
    },
  ],
} as unknown as AtterbergRecord;

const projectState = {
  records: [record],
  clientName: "KENYA AIRPORTS AUTHORITY",
  projectName: "KISUMU AIRPORT EXPANSION",
  labOrganization: "A. Waweru",
  dateReported: "26 Jul 2026, 12:38 pm",
  checkedBy: "",
} as never;

describe("atterberg desired pdf layout", () => {
  it("generates a single-page blob without throwing", async () => {
    const { generateAtterbergPDF } = await import("@/lib/atterbergPdfGenerator");
    const tiny =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const out = await generateAtterbergPDF({
      projectName: "KISUMU AIRPORT EXPANSION",
      clientName: "KENYA AIRPORTS AUTHORITY",
      projectState,
      records: [record],
      skipDownload: true,
      chartImages: { "rec-desired-liquidLimit": tiny },
    });
    expect(out).toBeInstanceOf(Blob);
    expect((out as Blob).size).toBeGreaterThan(2000);
  });
});
