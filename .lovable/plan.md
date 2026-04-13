

## Fix Build Errors + Expand Liquid Limit to 4 Default Trials

### Part 1: Fix Build Errors

**File: `src/components/soil/AtterbergTest.tsx`**

**Fix 1 (line 27-35):** Add missing type imports from `@/context/TestDataContext`:
```typescript
import {
  // existing imports...
  type LiquidLimitTest,
  type PlasticLimitTest,
  type ShrinkageLimitTest,
} from "@/context/TestDataContext";
```

**Fix 2 (line 518):** Add generic type to `createApiRecord`:
```typescript
const createResponse = await retryWithBackoff(
  () => createApiRecord<{ id: number }>("test_results", resultPayload)
);
```

### Part 2: Expand Default Liquid Limit Trials to 4

**File: `src/components/soil/AtterbergTest.tsx` (lines 224-245)**

Replace the 2 default liquid limit trials with 4 trials using realistic data that produces a curved (non-linear) graph. Based on the Master Excel reference, the cone penetration test typically uses 4 trials with penetration values spanning a range around 20mm (e.g., 15mm, 18mm, 22mm, 27mm) with corresponding moisture values that follow a natural curve:

```typescript
trials: [
  {
    id: makeId("trial"), trialNo: "1",
    penetration: "15", containerNo: "101",
    containerWetMass: "23.8", containerDryMass: "17.6", containerMass: "5.0",
    moisture: "",
  },
  {
    id: makeId("trial"), trialNo: "2",
    penetration: "18", containerNo: "102",
    containerWetMass: "25.1", containerDryMass: "18.0", containerMass: "5.1",
    moisture: "",
  },
  {
    id: makeId("trial"), trialNo: "3",
    penetration: "22", containerNo: "103",
    containerWetMass: "27.3", containerDryMass: "18.8", containerMass: "5.0",
    moisture: "",
  },
  {
    id: makeId("trial"), trialNo: "4",
    penetration: "27", containerNo: "104",
    containerWetMass: "29.8", containerDryMass: "19.6", containerMass: "5.2",
    moisture: "",
  },
],
```

The mass values are chosen so the computed moisture contents form a natural curve (not a straight line) when plotted against penetration. This gives approximately:
- Trial 1: ~49.2% at 15mm
- Trial 2: ~55.0% at 18mm  
- Trial 3: ~61.6% at 22mm
- Trial 4: ~70.8% at 27mm

### Part 3: Update Minimum Trials for Graph Display

**File: `src/components/soil/LiquidLimitSection.tsx` (line 203)**

No change needed — the graph already shows when `graphData.length >= 2`, which is correct since 2 points is the mathematical minimum. With 4 default trials, the graph will naturally show a curve.

### Summary

| File | Change |
|------|--------|
| `AtterbergTest.tsx` | Add 3 missing type imports; add generic to `createApiRecord`; expand LL trials from 2 to 4 |

