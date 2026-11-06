# PSD & Atterberg Integration - Implementation Guide

## **How to Integrate the Formulas into Your Kindred App**

The `psd-sieve-formulas.ts` module is ready at:
`C:\xampp\htdocs\kindred\src\lib\psd-sieve-formulas.ts`

## **1. Import the Module**

In any TypeScript/React file:

```typescript
// Full import (all functions):
import {
  calculatePercentRetained,
  calculateCumulativePassing,
  calculateGradationCoeffs,
  processSieveAnalysis,
  classifySoilByAtterberg,
  calculateLiquidityIndex,
  analyzeAtterbergLimits,
  calculatePlasticityIndex,
  getSoilClassificationLabel,
  formatPsdForPdf,
  generatePsdPdfSummary,
  PsdAnalysisResult,
  PsdSieveData,
} from '@/lib/psd-sieve-formulas';

// Or import only what you need:
import { calculatePercentRetained, calculateGradationCoeffs } from '@/lib/psd-sieve-formulas';
```

## **2. Basic Usage Example**

```typescript
// Example: Analyze a PSD test from Excel-imported data

// 1. Prepare your sieve data (from ATTERTEST.xlsx or user input)
const sieveData: PsdSieveData[] = [
  { sieveSize: 1.0, retainedMass: 0 },
  { sieveSize: 0.5, retainedMass: 5.2 },
  { sieveSize: 0.25, retainedMass: 12.5 },
  { sieveSize: 0.1, retainedMass: 25.8 },
  { sieveSize: 0.05, retainedMass: 85.1 },
  { sieveSize: 0.02, retainedMass: 5.4 },
];

// 2. Total sample mass
const totalMass: number = 188.9;

// 3. Atterberg data (from separate Atterberg test)
const atterbergData = {
  liquidLimit: 45.0,
  plasticLimit: 25.0,
  naturalWaterContent: 22.5,
};

// 3. Process sieve analysis
const analysis = processSieveAnalysis(sieveData, totalMass);

// 4. Analyze Atterberg limits
const atterberg = analyzeAtterbergLimits(
  atterbergData.liquidLimit,
  atterbergData.plasticLimit,
  atterbergData.naturalWaterContent,
  40 // fines content % passing #200
);

// 5. Get gradation coefficients
const { uniformityCoefficient, coefficientOfCurvature, d10, d50, d60 } = 
  calculateGradationCoeffs(
    analysis.sieveData.map((s) => s.sieveSize),
    analysis.percentPassing
  );

// 6. Classify the soil
const classification = classifySoilByAtterberg(
  atterbergData.liquidLimit,
  atterberg.plasticityIndex,
  40 // fines content
);

// 7. Get human-readable label
const label = getSoilClassificationLabel(
  atterbergData.liquidLimit,
  atterberg.plasticityIndex,
  40
);

// 8. Format for PDF (compatible with your existing drawRow)
const { headers, rowData } = formatPsdForPdf({
  ...analysis,
  atterbergData: {
    ...atterberg,
    naturalWaterContent: atterbergData.naturalWaterContent,
  },
});

// 9. Generate PDF summary text
const summary = generatePsdPdfSummary({
  ...analysis,
  atterbergData: {
    ...atterberg,
    naturalWaterContent: atterbergData.naturalWaterContent,
  },
});

console.log('=== Results ===');
console.log('Classification:', classification);
console.log('Label:', label);
console.log('PI:', atterberg.plasticityIndex);
console.log('LI:', atterberg.liquidityIndex >= 0 ? '+' + atterberg.liquidityIndex.toFixed(2) : atterberg.liquidityIndex.toFixed(2));
console.log('Cu:', uniformityCoefficient?.toFixed(2));
console.log('Cc:', coefficientOfCurvature?.toFixed(2));
console.log('D10:', d10?.toFixed(2), 'mm');
console.log('D50:', medianSize?.toFixed(2), 'mm');
console.log('D60:', d60?.toFixed(2), 'mm');
console.log('Headers:', headers);
console.log('First 2 rows:', rowData.slice(0, 2).map((r) => r.join(' | ')));
console.log('Summary:\n', summary);
```

## **3. Integration Points in Your App**

### **A. In TestResults.tsx or similar page:**
```typescript
import { processSieveAnalysis, analyzeAtterbergLimits, formatPsdForPdf } from '@/lib/psd-sieve-formulas';

// In your test analysis handler:
const handlePsdAnalysis = (sieveData, totalMass, atterbergData) => {
  const analysis = processSieveAnalysis(sieveData, totalMass);
  const atterberg = analyzeAtterbergLimits(
    atterbergData.liquidLimit,
    atterbergData.plasticLimit,
    atterbergData.naturalWaterContent,
    40
  );
  
  const { headers, rowData } = formatPsdForPdf({
    ...analysis,
    atterbergData: {
      ...atterberg,
      naturalWaterContent: atterbergData.naturalWaterContent,
    },
  });
  
  // Store in state or pass to PDF generation
  setPsdAnalysis({ analysis, atterberg, headers, rowData });
};
```

### **B. In PDF generation (compatible with your existing drawRow):**
```typescript
// The formatPsdForPdf output is compatible with your existing jsPDF drawRow pattern
// headers: string[] = ['Sieve (mm)', 'Retained (gm)', '% Retained', 'Cum. Passing (%)', 'Soil Fraction']
// rowData: string[][] = [[values], [values], ...]

// Example: Append PSD rows to your existing PDF
const addPsdToPdf = (psdResult: PsdAnalysisResult) => {
  const { headers, rowData } = formatPsdForPdf(psdResult);
  
  // Your existing drawRow function can use these:
  // headers and rowData are in the same format as your compressive strength PDF
  
  // Example: Add to report
  // reportRows.push(...rowData);
  // reportHeaders.push(...headers);
};
```

### **C. In your Atterberg calculations (atterbergCalculations.ts):**
The new formulas complement your existing Atterberg module:

```typescript
// Import and use alongside existing Atterberg functions:
import { calculateLiquidityIndex, classifySoilByAtterberg } from '@/lib/psd-sieve-formulas';
import { calculatePlasticityIndex, classifySoil } from '@/lib/atterbergCalculations';

// Use different approaches:
// - psd-sieve-formulas.ts: Simple LL/PL/Fines input → PI/LI/Classification
// - atterbergCalculations.ts: Full trial-based LL/PL calculation from cone penetration data
```

## **4. Key Differences Between the Two Atterberg Modules**

| Feature | `atterbergCalculations.ts` | `psd-sieve-formulas.ts` |
|---|---|---|
| **LL/PL source** | From cone penetration trials (ASTM D4318 / BS 1377) | From user input or separate test data |
| **PI calculation** | `LL - PL` with physical constraint checks | `LL - PL` basic calculation |
| **LI calculation** | `(w - PL) / PI` with trial moisture | `(w - PL) / PI` basic calculation |
| **Classification** | Full BS 1377 / USCS with A-line, U-line, NP handling | A-line method only (CL, CH, ML, MH, CL-ML) |
| **Best for** | Full Atterberg test report from lab trials | Quick PSD + Atterberg combination |
| **Trial data needed** | Yes (penetration readings, moisture values) | No (just LL/PL/water content values) |

## **5. Connecting to Your Existing PDF Generator**

The `formatPsdForPdf()` function output is designed to work with your existing `drawRow` from `cs_vals.ts`. Here's how to connect:

```typescript
// In your PDF generation code:
// Existing drawRow expects: values: string[], y: number, rowH: number

// To add PSD rows to your compressive strength PDF:

const psdResult = analyzePsdTest(sieveData, totalMass, atterbergData);
const { headers, rowData } = formatPsdForPdf(psdResult);

// Add PSD section to your PDF:
// After your existing compressive strength rows:

let cursorY = yourCurrentCursorPosition;

rowData.forEach((row, i) => {
  cursorY = drawRow(psdPdf, cursorY, row, rowHeight); // your existing function
});
```

## **6. What the Arrows in Your Sieve Image Represent**

Based on your description, the complete flow is:

```
GRAVEL section ──► No. 10 sieve (~2.00 mm)
      │
      ▼
SAND section ────► Second last sieve row (~0.10 mm)
      │
      ▼
Last sieve row ───► Last row (fine fraction, <0.075 mm, #200 sieve)
      │
      ▼
                          ↓
                          >>> (junction point)
                          │
                          ▼
                  "Soil Classification" summary table
```

**What determines the final classification:**

1. **Gradation (from sieve analysis):** Cu, Cc, D10, D50, D60
2. **Atterberg Limits:** LL, PL, PI, LI  
3. **A-line method:** `PI = 0.73 × (LL - 20)`
4. **Classification:** CL/CH/MH/ML/CL-ML based on LL, PI, and fines content

## **7. Quick Checklist for Integration**

- [ ] Import `psd-sieve-formulas.ts` in your target file
- [ ] Call `processSieveAnalysis(sieveData, totalMass)` 
- [ ] Call `analyzeAtterbergLimits(ll, pl, w, fines)`
- [ ] Use `formatPsdForPdf(result)` for PDF table data
- [ ] Use `generatePsdPdfSummary(result)` for PDF footers
- [ ] Update your UI to display: PI, LI, Classification, Cu, Cc, D10, D50, D60
- [ ] Connect `formatPsdForPdf` output to your existing jsPDF `drawRow` function

## **8. File Locations**

- **Module:** `C:\xampp\htdocs\kindred\src\lib\psd-sieve-formulas.ts`
- **PDF Generator (to modify):** `C:\xampp\htdocs\kindred\src\lib\psdPdfGenerator.ts`
- **Existing Atterberg:** `C:\xampp\htdocs\kindred\src\lib\atterbergCalculations.ts`
- **Existing PDF Generator (full):** `C:\xampp\htdocs\kindred\src\lib\psdPdfGenerator.ts`

---

**🎯 The integration is now ready to use. Import the functions, run the example, and connect the output to your existing PDF generation pipeline. The formulas cover all the Excel-derived logic from ATTERTEST.gzx that we analyzed earlier.**

Would you like me to help with a specific part of the integration, such as modifying a particular page component or connecting the output to your PDF generator?