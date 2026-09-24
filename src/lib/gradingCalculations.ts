export interface GradingRow {
  sieveSize: string;
  weightRetained: string;
}

export interface GradingCalculations {
  totalWeight: number;
  percentageRetained: number[];
  cumulativePassing: Array<number | null>;
  d10: number | null;
  d30: number | null;
  d60: number | null;
  cu: number | null;
  cc: number | null;
}

const numeric = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const calculateGrading = (rows: GradingRow[]): GradingCalculations => {
  const totalWeight = rows.reduce((sum, row) => sum + numeric(row.weightRetained), 0);
  const percentageRetained = rows.map((row) => totalWeight > 0 ? (numeric(row.weightRetained) / totalWeight) * 100 : 0);
  let retained = 0;
  const cumulativePassing = rows.map((row, index) => {
    retained += numeric(row.weightRetained);
    return totalWeight > 0 && row.sieveSize.toLowerCase() !== "pan" ? (1 - retained / totalWeight) * 100 : null;
  });

  const points = rows
    .map((row, index) => ({ size: numeric(row.sieveSize), passing: cumulativePassing[index] }))
    .filter((point): point is { size: number; passing: number } => point.size > 0 && point.passing !== null)
    .sort((a, b) => a.size - b.size);

  const interpolate = (target: number): number | null => {
    for (let index = 0; index < points.length - 1; index += 1) {
      const first = points[index];
      const second = points[index + 1];
      if (first.passing <= target && second.passing >= target && second.passing !== first.passing) {
        const ratio = (target - first.passing) / (second.passing - first.passing);
        return 10 ** (Math.log10(first.size) + ratio * (Math.log10(second.size) - Math.log10(first.size)));
      }
    }
    return null;
  };

  const d10 = interpolate(10);
  const d30 = interpolate(30);
  const d60 = interpolate(60);
  const cu = d10 && d60 ? d60 / d10 : null;
  const cc = d10 && d30 && d60 ? (d30 * d30) / (d10 * d60) : null;

  return { totalWeight, percentageRetained, cumulativePassing, d10, d30, d60, cu, cc };
};

export const calculateMoisture = (wetMass: string, dryMass: string) => {
  const wet = numeric(wetMass);
  const dry = numeric(dryMass);
  const waterWeight = wet > 0 && dry > 0 ? wet - dry : null;
  const moistureContent = waterWeight !== null && dry > 0 ? (waterWeight / dry) * 100 : null;
  return { waterWeight, moistureContent };
};
