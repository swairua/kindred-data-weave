import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import MoistureDensityChart from "@/components/soil/MoistureDensityChart";

const POINTS = [
  { moisture: 8, dryDensity: 1750 },
  { moisture: 10, dryDensity: 1850 },
  { moisture: 12, dryDensity: 1920 },
  { moisture: 14, dryDensity: 1900 },
  { moisture: 16, dryDensity: 1830 },
  { moisture: 18, dryDensity: 1750 },
];

const FITTED = [
  { moisture: 8, dryDensity: 1752 },
  { moisture: 10, dryDensity: 1852 },
  { moisture: 12, dryDensity: 1912 },
  { moisture: 14, dryDensity: 1902 },
  { moisture: 16, dryDensity: 1832 },
  { moisture: 18, dryDensity: 1752 },
];

describe("MoistureDensityChart single curve", () => {
  it("draws only the fitted compaction curve, not a second measured polyline", () => {
    // Regression: the chart used to overlay the measured polyline (plus square
    // markers) on the fitted curve, so the export showed two red graphs where
    // the laboratory sheets show one.
    const { container } = render(
      <MoistureDensityChart points={POINTS} fitted={FITTED} voidLines={[]} />,
    );
    const redPaths = [...container.querySelectorAll("path")]
      .filter((path) => path.getAttribute("stroke") === "#c00000");
    expect(redPaths).toHaveLength(1);
    expect(container.querySelectorAll('rect[fill="#c00000"]')).toHaveLength(0);
  });

  it("draws no curve at all when nothing was fitted", () => {
    const { container } = render(
      <MoistureDensityChart points={POINTS} fitted={[]} voidLines={[]} />,
    );
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });
});
