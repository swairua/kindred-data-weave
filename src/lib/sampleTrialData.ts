import type { LiquidLimitTrial, PlasticLimitTrial, ShrinkageLimitTrial } from "@/context/TestDataContext";

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Generate realistic sample Liquid Limit trials for graph precision
 * Uses cone penetration method with typical clay soil properties
 * Generates trials with penetration depths from ~10mm to ~25mm
 */
export const generateSampleLiquidLimitTrials = (count: number, baseIndex: number = 0): LiquidLimitTrial[] => {
  const trials: LiquidLimitTrial[] = [];
  
  // Typical clay soil parameters
  const baseMoisture = 34; // Base moisture content %
  const moistureVariation = 3; // ±3% variation between trials
  
  // Penetration depths: spread from ~11mm to ~24mm for better regression fit
  const basePenetration = 17.5; // Center point
  const penetrationSpan = 7; // ±7mm from center
  
  for (let i = 0; i < count; i++) {
    const trialNo = baseIndex + i + 1;
    
    // Create penetration values spread across the range
    const penetrationRatio = count === 1 ? 0.5 : i / (count - 1);
    const penetration = basePenetration - penetrationSpan + penetrationRatio * (penetrationSpan * 2);
    
    // Create corresponding moisture values with slight variation
    const moistureRatio = penetrationRatio; // Moisture increases with penetration
    const moisture = baseMoisture - 5 + moistureRatio * 10 + (Math.random() - 0.5) * moistureVariation;
    
    trials.push({
      id: makeId("trial"),
      trialNo: String(trialNo),
      penetration: penetration.toFixed(1),
      moisture: moisture.toFixed(1),
      containerNo: `C${1000 + trialNo}`,
    });
  }
  
  return trials;
};

/**
 * Generate realistic sample Plastic Limit trials
 * Generates 2-3 trials with moisture content around 12-18%
 */
export const generateSamplePlasticLimitTrials = (count: number, baseIndex: number = 0): PlasticLimitTrial[] => {
  const trials: PlasticLimitTrial[] = [];
  
  // Typical plastic limit moisture content for clay
  const baseMoisture = 15;
  const moistureVariation = 1.5; // ±1.5% variation
  
  for (let i = 0; i < count; i++) {
    const trialNo = baseIndex + i + 1;
    const moisture = baseMoisture + (Math.random() - 0.5) * moistureVariation * 2;
    
    trials.push({
      id: makeId("trial"),
      trialNo: String(trialNo),
      moisture: moisture.toFixed(1),
      containerNo: `C${2000 + trialNo}`,
    });
  }
  
  return trials;
};

/**
 * Generate realistic sample Shrinkage Limit trials
 * Typical shrinkage from 140mm initial to ~110-130mm final
 */
export const generateSampleShrinkageLimitTrials = (count: number, baseIndex: number = 0): ShrinkageLimitTrial[] => {
  const trials: ShrinkageLimitTrial[] = [];
  
  const initialLength = 140; // Standard mould size (mm)
  const baseFinalLength = 120; // Shrinkage to ~120mm (14% shrinkage)
  const finalLengthVariation = 2; // ±2mm variation
  
  for (let i = 0; i < count; i++) {
    const trialNo = baseIndex + i + 1;
    const finalLength = baseFinalLength + (Math.random() - 0.5) * finalLengthVariation * 2;
    
    trials.push({
      id: makeId("trial"),
      trialNo: String(trialNo),
      initialLength: String(initialLength),
      finalLength: finalLength.toFixed(1),
    });
  }
  
  return trials;
};

/**
 * Calculate how many sample trials are needed to reach minimum count
 */
export const calculateSampleTrialsNeeded = (currentCount: number, minimumRequired: number = 5): number => {
  return Math.max(0, minimumRequired - currentCount);
};

/**
 * Create a summary of what sample data was added
 */
export const createSampleDataSummary = (testType: string, samplesAdded: number): string => {
  return `Added ${samplesAdded} sample trial(s) for ${testType} to reach 5-point precision for graphs`;
};
