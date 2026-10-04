import { describe, expect, it } from "vitest";
import {
  mergePsdSeries,
  PSD_DECADE_LINES,
  PSD_DECADE_TICKS,
  PSD_FRACTIONS,
  PSD_MINOR_TICKS,
  PSD_SUB_LABELS,
  psdBandCentre,
  psdCurvePath,
  psdCurveSamples,
  psdDecadePosition,
  psdX,
  psdY,
} from "@/lib/psdChartGeometry";

describe("psd axis mapping", () => {
  it("places each decade boundary at its fifth of the plot width", () => {
    const width = 500;
    const positions = PSD_DECADE_TICKS.map((size) => psdX(size, width));
    expect(positions).toEqual([0, 100, 200, 300, 400, 500]);
  });

  it("maps the BS fraction boundaries to the positions the reference sheet uses", () => {
    const width = 334.28;
    // 0.002 mm is 0.301 decades in, and the sheet rules sit about 20 pt from the edge.
    expect(psdX(0.002, width)).toBeCloseTo(20.13, 2);
    expect(psdX(0.063, width)).toBeCloseTo(120.3, 2);
    expect(psdX(2, width)).toBeCloseTo(220.69, 2);
    expect(psdX(63, width)).toBeCloseTo(320.86, 2);
  });

  it("clamps sizes outside the plotted domain to the plot edges", () => {
    expect(psdDecadePosition(0.0001)).toBe(0);
    expect(psdDecadePosition(1000)).toBe(5);
    expect(psdDecadePosition(0)).toBe(0);
    expect(psdDecadePosition(Number.NaN)).toBe(0);
  });

  it("puts 0 % at the bottom and 100 % at the top, clamping beyond the axis", () => {
    expect(psdY(0, 200)).toBe(200);
    expect(psdY(100, 200)).toBe(0);
    expect(psdY(50, 200)).toBe(100);
    expect(psdY(140, 200)).toBe(0);
    expect(psdY(-10, 200)).toBe(200);
  });
});

describe("psd gridlines and fractions", () => {
  it("draws a 2-9 gridline in each of the five decades", () => {
    expect(PSD_MINOR_TICKS).toHaveLength(40);
    expect(PSD_MINOR_TICKS[0]).toBeCloseTo(0.002, 10);
    expect(PSD_MINOR_TICKS[7]).toBeCloseTo(0.009, 10);
    expect(PSD_MINOR_TICKS[8]).toBeCloseTo(0.02, 10);
    expect(PSD_MINOR_TICKS[39]).toBeCloseTo(90, 10);
  });

  it("draws rules only on the four interior decades", () => {
    expect(PSD_DECADE_LINES).toEqual([0.01, 0.1, 1, 10]);
  });

  it("uses the BS 1377-2 fraction boundaries", () => {
    expect(PSD_FRACTIONS.map((band) => [band.from, band.to])).toEqual([
      [0.001, 0.002],
      [0.002, 0.063],
      [0.063, 2],
      [2, 63],
      [63, 100],
    ]);
  });

  it("labels CLAY plus three Fine/Medium/Coarse sub-fractions at their band centres", () => {
    expect(PSD_SUB_LABELS[0].label).toBe("CLAY");
    expect(PSD_SUB_LABELS[1].from).toBeCloseTo(psdBandCentre(0.002, 0.006), 10);
    expect(PSD_SUB_LABELS.map((band) => band.label)).toEqual([
      "CLAY",
      "Fine",
      "Medium",
      "Coarse",
      "Fine",
      "Medium",
      "Coarse",
      "Fine",
      "Medium",
      "Coarse",
      "COBBLES",
    ]);
  });
});

describe("mergePsdSeries", () => {
  it("merges sieve and hydrometer readings into one ascending series", () => {
    const sieve = [{ size: 2, passing: 80 }, { size: 0.063, passing: 60 }];
    const hydrometer = [{ size: 0.01, passing: 40 }, { size: 0.002, passing: 20 }];
    expect(mergePsdSeries(sieve, hydrometer)).toEqual([
      { size: 0.002, passing: 20 },
      { size: 0.01, passing: 40 },
      { size: 0.063, passing: 60 },
      { size: 2, passing: 80 },
    ]);
  });

  it("keeps the sieve reading where both methods report the same size", () => {
    const sieve = [{ size: 0.063, passing: 60 }];
    const hydrometer = [{ size: 0.063, passing: 55 }];
    expect(mergePsdSeries(sieve, hydrometer)).toEqual([{ size: 0.063, passing: 60 }]);
  });

  it("drops readings off the plotted domain and null entries", () => {
    const series = mergePsdSeries([
      { size: 0.0001, passing: 50 },
      { size: 200, passing: 50 },
      { size: Number.NaN, passing: 50 },
      null,
      { size: 1, passing: null },
      { size: 1, passing: 75 },
    ]);
    expect(series).toEqual([{ size: 1, passing: 75 }]);
  });

  it("treats sizes that differ only by floating point noise as one reading", () => {
    const series = mergePsdSeries([{ size: 0.063, passing: 60 }], [{ size: 0.0630000000001, passing: 40 }]);
    expect(series).toEqual([{ size: 0.063, passing: 60 }]);
  });
});

describe("psd curve", () => {
  const sieve = [
    { size: 0.063, passing: 60 },
    { size: 0.425, passing: 74 },
    { size: 2, passing: 80 },
    { size: 20, passing: 91 },
  ];

  it("draws nothing until there are two points", () => {
    expect(psdCurvePath([], 100, 100)).toBe("");
    expect(psdCurvePath([{ size: 1, passing: 50 }], 100, 100)).toBe("");
  });

  it("emits a move followed by one cubic per gap", () => {
    const path = psdCurvePath(sieve, 300, 200);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.match(/C /g)).toHaveLength(sieve.length - 1);
  });

  it("never overshoots between a flat pair of readings", () => {
    // 40 % and 40 % must not bulge above 40 on the way across.
    const samples = psdCurveSamples([{ size: 0.1, passing: 40 }, { size: 1, passing: 40 }], 100, 100);
    samples.forEach((sample) => expect(sample.y).toBeCloseTo(60, 6));
  });

  it("keeps every sample inside the plot rectangle", () => {
    const samples = psdCurveSamples(sieve, 300, 200);
    samples.forEach((sample) => {
      expect(sample.x).toBeGreaterThanOrEqual(0);
      expect(sample.x).toBeLessThanOrEqual(300);
      expect(sample.y).toBeGreaterThanOrEqual(0);
      expect(sample.y).toBeLessThanOrEqual(200);
    });
  });

  it("samples the same curve the SVG path traces", () => {
    const samples = psdCurveSamples(sieve, 300, 200, 8);
    const path = psdCurvePath(sieve, 300, 200);
    const first = samples[0];
    expect(path).toContain(`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`);
  });
});
