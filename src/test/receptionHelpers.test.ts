import { describe, expect, it } from "vitest";
import {
  consignmentIsOnHold,
  consignmentMaterial,
  cubeDueDates,
  deriveConsignmentStatus,
  emptyReceptionConsignment,
  emptyReceptionSample,
  isSampleOnHold,
  nextLabId,
  nextRcNo,
  receptionSummary,
  sampleTypeTag,
  type ReceptionConsignmentInput,
} from "@/lib/reception";

/** Builds the RC-26-0418 consignment from the reference mockup. */
const mockFullConsignment = (): ReceptionConsignmentInput => {
  const consignment = emptyReceptionConsignment("RC-26-0418");
  consignment.jobNo = "26-0418";
  consignment.client = "Kenya Railways";
  consignment.project = "KUMIP Line 1 (Golf Bridge-Limuru)";
  consignment.clientRef = "KR-SSF-0093";
  consignment.deliveredBy = "Joel Wairua (CMTC field team)";
  consignment.vehicleReg = "KDx 000X";
  consignment.receivedAt = "2026-10-19T09:58";
  consignment.methodSet = "BS 1377-2:2022";
  consignment.receivedBy = "Eng. Anthony Murage";
  consignment.samples = [
    {
      ...emptyReceptionSample("26-0418/01"),
      clientMark: "BH07-D1",
      location: "BH07",
      depthLabel: "0.50-1.00",
      sampleType: "Disturbed bulk",
      container: "Heavy-duty bag",
      massKg: "18.4",
      condition: "Intact",
      tests: ["MC", "PSD", "ATT", "CMP", "CBR"],
    },
    {
      ...emptyReceptionSample("26-0418/02"),
      clientMark: "BH07-U1",
      location: "BH07",
      depthLabel: "1.50-1.95",
      sampleType: "Undisturbed U100",
      container: "U100 tube, waxed & capped",
      condition: "Intact",
      tests: ["MC", "ATT", "UU", "CON"],
    },
    {
      ...emptyReceptionSample("26-0418/03"),
      clientMark: "BH07-S2",
      location: "BH07",
      depthLabel: "3.00-3.45",
      sampleType: "SPT split-spoon",
      container: "Jar, sealed",
      massKg: "0.6",
      condition: "Intact",
      tests: ["MC", "PSD", "ATT"],
    },
    {
      ...emptyReceptionSample("26-0418/04"),
      clientMark: "BH07-U2",
      location: "BH07",
      depthLabel: "4.50-4.95",
      sampleType: "Undisturbed U100",
      container: "U100 tube, waxed & capped",
      condition: "Seal broken",
      tests: ["UU"],
    },
    {
      ...emptyReceptionSample("26-0418/05"),
      clientMark: "BH07-W1",
      location: "BH07",
      depthLabel: "6.20",
      sampleType: "Groundwater",
      container: "1 L bottle",
      condition: "Intact",
      tests: ["CHEM"],
    },
  ];
  return consignment;
};

describe("isSampleOnHold", () => {
  it("holds seal-broken and too-little samples only", () => {
    expect(isSampleOnHold("Seal broken")).toBe(true);
    expect(isSampleOnHold("Too little")).toBe(true);
    expect(isSampleOnHold("Intact")).toBe(false);
    expect(isSampleOnHold("Disturbed")).toBe(false);
  });
});

describe("nextLabId", () => {
  it("sequences the next suffix for the job", () => {
    expect(nextLabId("26-0418", ["26-0418/01", "26-0418/05"])).toBe("26-0418/06");
  });

  it("starts at 01 and ignores other jobs", () => {
    expect(nextLabId("26-0418", ["26-0415/02"])).toBe("26-0418/01");
  });
});

describe("nextRcNo", () => {
  it("sequences the consignment number", () => {
    expect(nextRcNo(["RC-26-0417", "RC-26-0418"])).toBe("RC-26-0419");
  });
});

describe("receptionSummary", () => {
  it("counts the RC-26-0418 mock: 5 samples, 14 tests, 1 held", () => {
    expect(receptionSummary(mockFullConsignment().samples)).toEqual({
      samples: 5,
      tests: 14,
      onHold: 1,
      heldTests: 1,
    });
  });
});

describe("cubeDueDates", () => {
  it("computes 7- and 28-day breaks from the cast date", () => {
    expect(cubeDueDates("2026-10-14")).toEqual({
      sevenDay: "2026-10-21",
      twentyEightDay: "2026-11-11",
    });
  });

  it("returns nulls for an unparseable date", () => {
    expect(cubeDueDates("")).toEqual({ sevenDay: null, twentyEightDay: null });
  });
});

describe("emptyReceptionConsignment", () => {
  it("defaults to the BS 1377 method set from the mock", () => {
    expect(emptyReceptionConsignment("RC-26-0419").methodSet).toBe("BS 1377-2:2022");
  });

  it("starts as a draft with no samples", () => {
    const fresh = emptyReceptionConsignment("RC-26-0419");
    expect(fresh.status).toBe("draft");
    expect(fresh.samples).toEqual([]);
  });
});

describe("sampleTypeTag", () => {
  it("shortens the sample types to their matrix tag", () => {
    expect(sampleTypeTag("Disturbed bulk")).toBe("Bulk");
    expect(sampleTypeTag("Undisturbed U100")).toBe("U100");
    expect(sampleTypeTag("SPT split-spoon")).toBe("SPT");
    expect(sampleTypeTag("Groundwater")).toBe("Water");
    expect(sampleTypeTag("Concrete cube")).toBe("Cube");
  });

  it("falls back to the raw type when it is not one of the known ones", () => {
    expect(sampleTypeTag("Rock core")).toBe("Rock core");
    expect(sampleTypeTag("")).toBe("Sample");
  });
});

describe("consignmentIsOnHold", () => {
  it("flags the mock consignment because sample 04 has a broken seal", () => {
    expect(consignmentIsOnHold(mockFullConsignment())).toBe(true);
  });

  it("is clear when every sample passed intake", () => {
    const consignment = mockFullConsignment();
    consignment.samples[3].condition = "Intact";
    expect(consignmentIsOnHold(consignment)).toBe(false);
  });

  it("is never on hold for a draft with no samples", () => {
    expect(consignmentIsOnHold(emptyReceptionConsignment("RC-26-0419"))).toBe(false);
  });
});

describe("consignmentMaterial", () => {
  it("lists the distinct materials of the mock consignment", () => {
    expect(consignmentMaterial(mockFullConsignment())).toBe("Soil: bulk, u100, spt; water");
  });

  it("falls back to a dash when no sample type was recorded", () => {
    expect(consignmentMaterial(emptyReceptionConsignment("RC-26-0419"))).toBe("—");
  });
});

describe("deriveConsignmentStatus", () => {
  it("keeps a draft a draft", () => {
    expect(deriveConsignmentStatus(mockFullConsignment())).toBe("draft");
  });

  it("puts a received consignment with a held sample on hold", () => {
    const consignment = mockFullConsignment();
    consignment.status = "logged";
    expect(deriveConsignmentStatus(consignment)).toBe("on-hold");
  });

  it("logs a received consignment whose samples all passed intake", () => {
    const consignment = mockFullConsignment();
    consignment.status = "logged";
    consignment.samples[3].condition = "Intact";
    expect(deriveConsignmentStatus(consignment)).toBe("logged");
  });
});

