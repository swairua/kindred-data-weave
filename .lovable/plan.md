

## Update USCS Soil Classification Logic

### Analysis from Excel

The uploaded Atterberg test shows:
- **LL = 75.91**, PL = 33.45, **PI = 42.45**
- USCS result: **CH — "CLAY OF HIGH OF PLASTICITY"**
- AASHTO: A-7-5 (because PI = 42.45 < LL - 30 = 45.91)
- 5 liquid limit trials at penetrations: 15.8, 17.9, 20.1, 21.9, 24.3mm

Excel formula for USCS description:
```
=IF(symbol="ML", "SILT OF LOW OF PLASTICITY",
 IF(symbol="MH", "SILT OF HIGH OF PLASTICITY",
 IF(symbol="CL-ML", "SILTY CLAY OF LOW OF PLASTICITY",
 IF(symbol="CL", "CLAY OF LOW OF PLASTICITY",
 IF(symbol="CH", "CLAY OF HIGH OF PLASTICITY", "")))))
```

AASHTO A-7 subgroup logic from Excel: `PI ≤ LL - 30 → A-7-5; PI > LL - 30 → A-7-6`

### Changes

**File: `src/lib/soilClassification.ts`**

**1. Fine-grained classification** — update descriptions to match Excel format and add CL-ML dual symbol for the hatched zone (PI 4–7 and above A-line):

| Symbol | Description (current) | Description (updated) |
|--------|----------------------|----------------------|
| CL | Lean clay (low compressibility) | CLAY OF LOW OF PLASTICITY |
| CH | Fat clay (high compressibility) | CLAY OF HIGH OF PLASTICITY |
| ML | Silt (low compressibility) | SILT OF LOW OF PLASTICITY |
| MH | Elastic silt (high compressibility) | SILT OF HIGH OF PLASTICITY |
| CL-ML (new) | — | SILTY CLAY OF LOW OF PLASTICITY |

Add CL-ML: when LL < 50, above A-line, and PI between 4–7.

**2. Fix fines threshold** — change `fines > 50` to `fines >= 50` per USCS standard ("≥50% passing No. 200").

**3. Fix coarse-grained fines logic** — the `classifySand` function has a bug where `clayey = !silty && fines > 12` is impossible (since `silty` already covers `fines > 12`). Fix: for fines > 12%, use A-line position to determine clayey (SC/GC) vs silty (SM/GM).

**4. Fix AASHTO function:**
- Remove dead branch (line 218 duplicates line 216)
- Implement proper A-7 subgroup: `PI ≤ LL - 30 → A-7-5; PI > LL - 30 → A-7-6`
- Add proper A-2 subgroups

**5. Update `calculatePlasticityChart`** — match description format to "CLAY OF HIGH OF PLASTICITY" style.

### Technical Detail

```typescript
// Fine-grained classification core logic
const classifyFineGrained = (ll, pi) => {
  const aLine = 0.73 * (ll - 20);
  const aboveLine = pi > aLine;

  if (ll < 50) {
    if (aboveLine && pi >= 4 && pi <= 7) return "CL-ML"; // hatched zone
    if (aboveLine) return "CL";
    return "ML";
  } else {
    if (aboveLine) return "CH";
    return "MH";
  }
};

// AASHTO A-7 subgroup
if (fines > 35 && ll >= 40) {
  return pi <= (ll - 30) ? "A-7-5" : "A-7-6";
}
```

### Summary

| File | Change |
|------|--------|
| `src/lib/soilClassification.ts` | Fix fines threshold (≥50), add CL-ML, update descriptions to Excel format, fix coarse-grained A-line logic, fix AASHTO dead branch + A-7 subgroup |

