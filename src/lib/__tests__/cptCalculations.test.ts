import { describe, expect, it } from "vitest";
import {
  calculateFrictionRatio,
  classifySoilRobertson,
  rederiveCptRow,
} from "@/lib/cptCalculations";

describe("calculateFrictionRatio", () => {
  it("converts fs (kPa) against qc (MPa) to a percent", () => {
    // Rf = fs / (qc * 10)
    expect(calculateFrictionRatio(2.5, 25)).toBeCloseTo(1.0, 2);
    expect(calculateFrictionRatio(4.8, 40)).toBeCloseTo(0.8333, 3);
    expect(calculateFrictionRatio(7.2, 55)).toBeCloseTo(0.7639, 3);
  });

  it("treats zero sleeve friction as a legitimate Rf of 0", () => {
    expect(calculateFrictionRatio(5, 0)).toBe(0);
  });

  it("returns 0 instead of NaN for invalid cone resistance", () => {
    expect(calculateFrictionRatio(0, 25)).toBe(0);
    expect(calculateFrictionRatio(-1, 25)).toBe(0);
    expect(calculateFrictionRatio(NaN, 25)).toBe(0);
  });
});

describe("classifySoilRobertson", () => {
  it("classifies the seeded KITENG CPT-01 rows", () => {
    // qc in MPa, Rf in percent (derived from fs in kPa)
    expect(classifySoilRobertson(2.5, 1.0)).toBe("Silty Sand to Sandy Silt");
    expect(classifySoilRobertson(4.8, 0.83)).toBe("Silty Sand to Sandy Silt");
    expect(classifySoilRobertson(7.2, 0.76)).toBe("Sand to Silty Sand");
  });

  it("resolves the cohesive bands by friction ratio", () => {
    expect(classifySoilRobertson(0.5, 9)).toBe("Clay");
    expect(classifySoilRobertson(3, 6)).toBe("Silty Clay to Clay");
    expect(classifySoilRobertson(0.5, 3)).toBe("Clayey Silt to Silty Clay");
  });

  it("closes the gaps that previously returned Unclassified", () => {
    // qc > 10 with Rf >= 1 (zone 8/9)
    expect(classifySoilRobertson(15, 1.2)).toBe("Very Stiff Sand to Clayey Sand");
    // qc 5-10 with Rf 1.5-2
    expect(classifySoilRobertson(6, 1.8)).toBe("Silty Sand to Sandy Silt");
    // qc 2-5 with Rf 2-5
    expect(classifySoilRobertson(3, 3)).toBe("Clayey Silt to Silty Clay");
    // qc 1-2 with Rf 3-5
    expect(classifySoilRobertson(1.5, 4)).toBe("Clayey Silt to Silty Clay");
  });

  it("never returns Unclassified for valid inputs (sweep)", () => {
    for (let q = 0.1; q <= 30; q += 0.7) {
      for (let rf = 0; rf <= 12; rf += 0.4) {
        expect(classifySoilRobertson(q, rf), `qc=${q}, Rf=${rf}`).not.toBe("Unclassified");
      }
    }
  });

  it("returns Unclassified only for invalid inputs", () => {
    expect(classifySoilRobertson(0, 2)).toBe("Unclassified");
    expect(classifySoilRobertson(-1, 2)).toBe("Unclassified");
    expect(classifySoilRobertson(2, -0.1)).toBe("Unclassified");
    expect(classifySoilRobertson(NaN, 2)).toBe("Unclassified");
  });
});

describe("rederiveCptRow", () => {
  it("recomputes Rf and classification from raw inputs", () => {
    const out = rederiveCptRow({ depth: "1.0", coneResistance: "2.5", sleeveFriction: "25" });
    expect(out.frictionRatio).toBe("1.00");
    expect(out.soilClass).toBe("Silty Sand to Sandy Silt");
  });

  it("blanks the derived cells when inputs are incomplete", () => {
    const out = rederiveCptRow({ depth: "2.0", coneResistance: "4.8", sleeveFriction: "" });
    expect(out.frictionRatio).toBe("");
    expect(out.soilClass).toBe("");
  });
});
