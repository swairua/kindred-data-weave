import { describe, expect, it } from "vitest";
import {
  STANDARD_CONE_HEIGHT,
  calculateSlump,
  classifySlumpClass,
  describeWorkability,
  toleranceBand,
  assessCompliance,
  assessValidity,
  rederiveSlumpEntry,
} from "@/lib/slumpCalculations";

describe("calculateSlump", () => {
  it("subtracts the subsided height from the cone height", () => {
    expect(calculateSlump(300, 225)).toBe(75);
    expect(calculateSlump(300, 300)).toBe(0); // zero slump is a legitimate reading
    expect(calculateSlump(STANDARD_CONE_HEIGHT, 290)).toBe(10);
  });

  it("rejects non-physical and missing readings", () => {
    expect(calculateSlump(300, 320)).toBeNaN(); // above cone height
    expect(calculateSlump(300, -5)).toBeNaN();
    expect(calculateSlump(0, 100)).toBeNaN();
    expect(calculateSlump(NaN, 100)).toBeNaN();
  });
});

describe("classifySlumpClass", () => {
  it("classes the seeded KITENG SLUMP-01 reading", () => {
    expect(classifySlumpClass(75)).toBe("S2");
    expect(describeWorkability(75)).toBe("Medium - normal reinforced concrete, vibration");
  });

  it("closes the gaps between EN 206 bands by rounding to the nearest class", () => {
    expect(classifySlumpClass(45)).toBe("S1"); // midpoint rounds down
    expect(classifySlumpClass(46)).toBe("S2");
    expect(classifySlumpClass(95)).toBe("S2");
    expect(classifySlumpClass(96)).toBe("S3");
    expect(classifySlumpClass(155)).toBe("S3");
    expect(classifySlumpClass(156)).toBe("S4");
    expect(classifySlumpClass(215)).toBe("S4");
    expect(classifySlumpClass(216)).toBe("S5");
  });

  it("never throws for valid inputs (sweep)", () => {
    for (let s = 0; s <= 260; s += 0.5) {
      expect(classifySlumpClass(s), `slump=${s}`).not.toBe("");
      expect(describeWorkability(s), `slump=${s}`).not.toBe("");
    }
  });

  it("returns empty for invalid inputs", () => {
    expect(classifySlumpClass(NaN)).toBe("");
    expect(classifySlumpClass(-1)).toBe("");
  });
});

describe("toleranceBand and assessCompliance", () => {
  it("bands the tolerance by target slump", () => {
    expect(toleranceBand(40)).toBe(30);
    expect(toleranceBand(41)).toBe(40);
    expect(toleranceBand(90)).toBe(40);
    expect(toleranceBand(100)).toBe(50);
    expect(toleranceBand(NaN)).toBe(0);
  });

  it("gives a verdict only when a target is set", () => {
    // Target 70 mm -> +/-40 mm band -> window 30-110 mm
    expect(assessCompliance(75, 70)).toBe("Within tolerance (+/-40 mm)");
    expect(assessCompliance(30, 70)).toBe("Within tolerance (+/-40 mm)");
    expect(assessCompliance(110, 70)).toBe("Within tolerance (+/-40 mm)");
    expect(assessCompliance(20, 70)).toBe("Outside tolerance by 10 mm");
    expect(assessCompliance(75, NaN)).toBe("");
  });
});

describe("assessValidity", () => {
  it("flags readings outside the EN 12350-2 sensitive range", () => {
    expect(assessValidity(75)).toBe("");
    expect(assessValidity(0)).toContain("Zero slump");
    expect(assessValidity(5)).toContain("Below the EN 12350-2 sensitive range");
    expect(assessValidity(250)).toContain("slump flow");
  });
});

describe("rederiveSlumpEntry", () => {
  it("derives slump, class and workability from the heights", () => {
    const out = rederiveSlumpEntry({
      mouldHeight: "300",
      measuredHeight: "225",
      targetSlump: "70",
      slump: "",
    });
    expect(out.slump).toBe("75");
    expect(out.slumpClass).toBe("S2");
    expect(out.workability).toContain("Medium");
    expect(out.compliance).toBe("Within tolerance (+/-40 mm)");
    expect(out.notes).toBe("");
  });

  it("passes a legacy slump through when no measured height is present", () => {
    const out = rederiveSlumpEntry({
      mouldHeight: "300",
      measuredHeight: "",
      targetSlump: "",
      slump: "75",
    });
    expect(out.slump).toBe("75");
    expect(out.slumpClass).toBe("S2");
  });

  it("blanks the derived fields for non-physical inputs", () => {
    const out = rederiveSlumpEntry({
      mouldHeight: "300",
      measuredHeight: "320",
      targetSlump: "",
      slump: "",
    });
    expect(out.slump).toBe("");
    expect(out.slumpClass).toBe("");
    expect(out.workability).toBe("");
  });
});
