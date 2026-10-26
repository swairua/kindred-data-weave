/**
 * Porosity calculations.
 *
 * Porosity (n) = ((W_sat - W_dry) / V) * 100   (%)
 *
 * where:
 *   W_sat = saturated (wet) mass (g)
 *   W_dry = oven-dry mass (g)
 *   V     = volume of the sample (cm^3)
 *
 * The numerator (W_sat - W_dry) is the mass of water in the pores,
 * which numerically equals the volume of water in cm^3 (density of water = 1 g/cm^3).
 */

export interface PorosityInputs {
  dryWeight: string;
  satWeight: string;
  volume: string;
}

export interface PorosityResult {
  dryWeight: number;
  satWeight: number;
  volume: number;
  porosity: number; // %
}

export const calculatePorosity = (
  dryWeight: string,
  satWeight: string,
  volume: string
): number | null => {
  const dw = parseFloat(dryWeight);
  const sw = parseFloat(satWeight);
  const v = parseFloat(volume);
  if (!dw || !sw || !v || v === 0) return null;
  return ((sw - dw) / v) * 100;
};

export const calculatePorosityResult = (
  inputs: PorosityInputs
): PorosityResult | null => {
  const porosity = calculatePorosity(
    inputs.dryWeight,
    inputs.satWeight,
    inputs.volume
  );
  if (porosity === null) return null;
  return {
    dryWeight: parseFloat(inputs.dryWeight),
    satWeight: parseFloat(inputs.satWeight),
    volume: parseFloat(inputs.volume),
    porosity,
  };
};