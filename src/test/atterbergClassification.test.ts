import { describe, expect, it } from "vitest";
import { classifyAtterberg, classifySoil } from "@/lib/atterbergCalculations";
import { classifySoilUSCS, calculatePlasticityChart } from "@/lib/soilClassification";

// ===== GUARD ORDER (per the guide) =====

describe("classifyAtterberg — input guards", () => {
  it("returns invalid with flags.valid = false + error when inputs are missing", () => {
    const missingPL = classifyAtterberg(null, 20);
    expect(missingPL.status).toBe("invalid");
    expect(missingPL.flags.valid).toBe(false);
    expect(missingPL.flags.error).toBeTruthy();
    expect(missingPL.USCS_classification).toBeNull();
    expect(missingPL.BS_classification).toBeNull();

    const missingLL = classifyAtterberg(40, null);
    expect(missingLL.status).toBe("invalid");
    expect(missingLL.flags.valid).toBe(false);
    expect(missingLL.flags.error).toBeTruthy();
  });

  it("returns invalid for negative limits", () => {
    expect(classifyAtterberg(-1, 10).status).toBe("invalid");
    expect(classifyAtterberg(40, -5).status).toBe("invalid");
  });

  it("returns error when PL > LL", () => {
    const r = classifyAtterberg(20, 30);
    expect(r.status).toBe("error");
    expect(r.flags.valid).toBe(false);
    expect(r.flags.error).toContain("Plastic Limit cannot exceed");
    expect(r.USCS_classification).toBeNull();
    expect(r.BS_classification).toBeNull();
  });

  it("returns NP when PL = LL (PI = 0 tie-break)", () => {
    const r = classifyAtterberg(30, 30);
    expect(r.status).toBe("NP");
    expect(r.plasticityIndex).toBe(0);
    expect(r.BS_classification).toBe("NP");
    expect(r.USCS_classification).toBeNull();
    expect(r.plasticity_description).toBe("Non-plastic");
    expect(r.flags.nonPlastic).toBe(true);
    expect(r.flags.valid).toBe(true);
  });

  it("checks NP before the U-line guard (low LL, PI = 0)", () => {
    // U-line at LL 5 would be negative; NP must still win.
    const r = classifyAtterberg(5, 5);
    expect(r.status).toBe("NP");
    expect(r.flags.suspect).toBe(false);
  });

  it("flags suspect and does not classify when PI is above the U-line", () => {
    // LL = 50 → U-line PI = 0.9 × (50 − 8) = 37.8; PI = 40 is above it.
    const r = classifyAtterberg(50, 10);
    expect(r.plasticityIndex).toBe(40);
    expect(r.status).toBe("suspect");
    expect(r.flags.suspect).toBe(true);
    expect(r.flags.valid).toBe(false);
    expect(r.flags.error).toContain("U-line");
    expect(r.USCS_classification).toBeNull();
    expect(r.BS_classification).toBeNull();
  });

  it("classifies with a borderline flag when PI < 4", () => {
    const r = classifyAtterberg(40, 37); // PI = 3
    expect(r.status).toBe("classified");
    expect(r.flags.borderline).toBe(true);
    expect(r.flags.valid).toBe(true);
    // A-line at LL 40 = 14.6 → PI 3 is below it → ML; LL 40 is in the I band
    expect(r.USCS_classification).toBe("ML");
    expect(r.BS_classification).toBe("MI");
  });
});

// ===== MAIN LOGIC =====

describe("classifyAtterberg — A-line decision", () => {
  it("treats PI exactly on the A-line as clay (equality → clay)", () => {
    // LL = 40 → A-line PI = 14.6; PI = 40 − 25.4 = 14.6
    const r = classifyAtterberg(40, 25.4);
    expect(r.aLinePI).toBe(14.6);
    expect(r.plasticityIndex).toBe(14.6);
    expect(r.position).toBe("Above A-line");
    expect(r.USCS_classification).toBe("CL");
    expect(r.BS_classification).toBe("CI");
  });

  it("puts PI below the A-line on the silt side", () => {
    const r = classifyAtterberg(40, 32); // PI = 8 < 14.6
    expect(r.position).toBe("Below A-line");
    expect(r.USCS_classification).toBe("ML");
    expect(r.BS_classification).toBe("MI");
  });

  it("returns the four fixed USCS outputs at the LL = 50 boundary", () => {
    expect(classifyAtterberg(49, 25).USCS_classification).toBe("CL"); // PI 24 ≥ A-line 21.17
    expect(classifyAtterberg(49, 30).USCS_classification).toBe("ML"); // PI 19 < A-line 21.17
    expect(classifyAtterberg(50, 25).USCS_classification).toBe("CH"); // PI 25 ≥ A-line 21.9
    expect(classifyAtterberg(50, 30).USCS_classification).toBe("MH"); // PI 20 < A-line 21.9
  });
});

describe("classifyAtterberg — BS 1377 two-letter code", () => {
  it("joins first letter (C/M) with the LL-band second letter", () => {
    expect(classifyAtterberg(34, 21).BS_classification).toBe("CL"); // LL < 35 → L
    expect(classifyAtterberg(35, 22).BS_classification).toBe("CI"); // 35 ≤ LL < 50 → I
    expect(classifyAtterberg(50, 25).BS_classification).toBe("CH"); // 50 ≤ LL < 70 → H
    expect(classifyAtterberg(70, 30).BS_classification).toBe("CV"); // 70 ≤ LL < 90 → V
    expect(classifyAtterberg(90, 30).BS_classification).toBe("CE"); // LL ≥ 90 → E
  });

  it("uses M when PI is below the A-line", () => {
    const r = classifyAtterberg(70, 50); // PI 20 < A-line 36.5
    expect(r.BS_classification).toBe("MV");
    expect(r.USCS_classification).toBe("MH");
  });

  it("produces the guide's CI example with description and engineering note", () => {
    const r = classifyAtterberg(48, 22);
    expect(r.plasticityIndex).toBe(26);
    expect(r.BS_classification).toBe("CI");
    expect(r.USCS_classification).toBe("CL");
    expect(r.plasticity_description).toBe("Clay of Intermediate Plasticity");
    expect(r.engineering_note).toBe("Moderate volume change potential");
  });
});

describe("classifyAtterberg — CL-ML dual symbol (optional ASTM extension)", () => {
  it("emits USCS_dual in the hatched zone (LL < 50, 4 ≤ PI ≤ 7, at/above A-line)", () => {
    const r = classifyAtterberg(25, 20); // PI = 5, A-line = 3.65
    expect(r.USCS_classification).toBe("CL");
    expect(r.USCS_dual).toBe("CL-ML");
    expect(r.BS_classification).toBe("CL");
  });

  it("does not emit a dual symbol below the A-line or outside 4 ≤ PI ≤ 7", () => {
    expect(classifyAtterberg(25, 24).USCS_dual).toBeNull(); // PI = 1 → below A-line
    expect(classifyAtterberg(40, 34).USCS_dual).toBeNull(); // PI = 6 but below A-line (14.6)
    expect(classifyAtterberg(45, 37).USCS_dual).toBeNull(); // PI = 8 → outside the band
  });
});

// ===== UNIFIED SURFACES =====

describe("unified classification surfaces", () => {
  it("LL = 70 with PI = 20 classifies as MH everywhere (A-line respected)", () => {
    expect(classifySoil(70, 20)).toBe("Silt (MH)");
    expect(classifyAtterberg(70, 50).USCS_classification).toBe("MH");
  });

  it("classifySoilUSCS delegates to the canonical classifier", () => {
    const grain = { gravel: 0, sand: 0, fines: 100 };
    const r = classifySoilUSCS(grain, { liquidLimit: 70, plasticLimit: 50, plasticityIndex: 20 });
    expect(r.uscsSymbol).toBe("MH");
    expect(r.aashtoGroup).toBe("A-7-5");
  });

  it("calculatePlasticityChart delegates to the canonical classifier", () => {
    const r = calculatePlasticityChart(70, 20);
    expect(r?.classification).toBe("Silt of High Plasticity");
    expect(r?.nonPlastic).toBe(false);
  });

  it("keeps the legacy classifySoil labels", () => {
    expect(classifySoil(40, 20)).toBe("Clay (CL)");
    expect(classifySoil(40, 8)).toBe("Silt (ML)");
    expect(classifySoil(60, 40)).toBe("Clay (CH)");
    expect(classifySoil(60, 15)).toBe("Silt (MH)");
    expect(classifySoil(25, 5)).toBe("Silty Clay (CL-ML)");
    expect(classifySoil(30, 0)).toBe("NP");
    expect(classifySoil(30, -5)).toBe("NP");
    expect(classifySoil(null, 20)).toBe("No data");
    expect(classifySoil(40, null)).toBe("No data");
  });
});

