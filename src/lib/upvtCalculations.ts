/**
 * Ultrasonic Pulse Velocity Test (UPVT) calculations.
 *
 * Velocity (km/s) = Path Length (mm) / Transit Time (µs)
 *
 * Since 1 mm / 1 µs = 1 km/s, the formula is direct:
 *   V = L / T   (km/s)
 *
 * Quality classification (typical for concrete):
 *   >= 4.5 km/s  Excellent
 *   >= 3.5 km/s  Good
 *   >= 3.0 km/s  Medium
 *   >= 2.0 km/s  Poor
 *   <  2.0 km/s  Very Poor
 */

export interface UPVTRow {
  id: string;
  pathLength: string;
  transitTime: string;
}

export interface UPVTCalculation {
  id: string;
  pathLength: number;
  transitTime: number;
  velocity: number; // km/s
  quality: string;
}

export const calculateVelocity = (pathLength: string, transitTime: string): number | null => {
  const L = parseFloat(pathLength);
  const T = parseFloat(transitTime);
  if (!L || !T) return null;
  return L / T; // mm / µs = km/s
};

export const qualityFromVelocity = (velocity: number): string => {
  if (velocity >= 4.5) return "Excellent";
  if (velocity >= 3.5) return "Good";
  if (velocity >= 3.0) return "Medium";
  if (velocity >= 2.0) return "Poor";
  return "Very Poor";
};

export const calculateUPVTRows = (rows: UPVTRow[]): UPVTCalculation[] => {
  return rows
    .map((r) => {
      const velocity = calculateVelocity(r.pathLength, r.transitTime);
      const L = parseFloat(r.pathLength);
      const T = parseFloat(r.transitTime);
      if (velocity !== null && L && T) {
        return {
          id: r.id,
          pathLength: L,
          transitTime: T,
          velocity,
          quality: qualityFromVelocity(velocity),
        };
      }
      return null;
    })
    .filter((r): r is UPVTCalculation => r !== null);
};

export const averageVelocity = (calculations: UPVTCalculation[]): number | null => {
  if (calculations.length === 0) return null;
  const sum = calculations.reduce((s, c) => s + c.velocity, 0);
  return sum / calculations.length;
};