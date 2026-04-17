

## Plan: Make the Atterberg Graph Truly Algorithmic + Fix Build Error

### 1. Fix the build error (blocker)

**File:** `src/context/TestDataContext.tsx` (line 183)

`Promise.race([responsePromise, timeoutPromise])` resolves to `unknown` because `timeoutPromise` is typed `Promise<unknown>`. Type it as `Promise<never>` so the race result keeps the API type.

```ts
const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => reject(new Error("API request took too long - using default tests")), 8000);
});
```

This removes the three TS2339 errors at lines 196/199.

### 2. Make the Liquid Limit chart fully algorithmic

**File:** `src/components/soil/LiquidLimitSection.tsx`

The current chart already plots data points and a regression line, but it has issues:
- Uses **log scale Y-axis** in the visible chart (the algorithmic spec asks for linear axes — penetration vs moisture content)
- Regression line is drawn only through the data x-range, not extended to 20 mm if data doesn't cover it
- The 20 mm vertical reference line exists but the **LL intersection point is not visualised**
- The computed LL value is shown in a side card but not annotated on the graph itself
- No A-line / classification preview from this section

Changes:

1. **Switch the live chart Y-axis to linear** (remove `scale="log"`), with auto domain padded slightly. Keep the linear regression line that's already there.
2. **Extend the regression line to cover 20 mm** — generate two endpoints at `min(minPen, 18)` and `max(maxPen, 26)` so the LL intersection is always visible.
3. **Add an LL intersection dot** at `(20, regression.slope*20 + regression.intercept)` rendered as a distinct marker (red dot + label "LL = X%").
4. **Show the regression equation and R²** as a small caption beneath the chart (`y = m·x + b, R² = 0.98`) — purely derived from `calculateLinearRegression`.
5. **Add a small "Live Computed Values" panel** beside/under the LL card showing the dynamically derived: LL (at 20 mm), and — if PL is available from the parent record — PI, A-line PI threshold (`0.73·(LL−20)`), and USCS class (CL/CH/ML/MH). To keep this self-contained, accept two new optional props on `LiquidLimitSection`:
   - `plasticLimit?: number | null`
   - `passing425um?: string`

   Computation uses existing helpers: `calculatePlasticityIndex`, `getALinePI`, `classifySoil`.

6. **Optional A-line mini-overlay (toggle)**: a small "Show A-line preview" switch under the chart that, when enabled, renders a compact LL-vs-PI plasticity chart underneath using the existing `PlasticityChart` component (only when LL & PL are both known). No new chart code — just reuse.

**File:** `src/components/soil/AtterbergTest.tsx`

Where `LiquidLimitSection` is rendered for an LL test, pass down the record's currently computed `plasticLimit` (from `record.results.plasticLimit`) and `passing425um` so the live panel can display PI / classification.

### 3. Confirm the algorithm matches the spec

Already in place in `src/lib/atterbergCalculations.ts` — no change needed:
- `calculateMoistureFromMass` → `(W_wet − W_dry) / (W_dry − W_container) × 100` ✓
- `calculateLinearRegression` → least-squares slope/intercept/R² ✓
- LL extraction at 20 mm via regression: `slope*20 + intercept` (will be used in the chart layer; the existing `calculateLiquidLimit` interpolation stays as the result value, but we'll switch it to use the regression so the on-chart intersection and the reported LL agree).

Adjust `calculateLiquidLimit` to prefer the regression value when ≥ 2 valid trials:
```ts
const reg = calculateLinearRegression(validTrials.map(t => ({ x: t.penetration, y: t.moisture })));
if (reg) return round(reg.slope * 20 + reg.intercept);
```
Falls back to current interpolation if regression is degenerate.

- `calculatePlasticLimit` → average of PL moistures ✓
- `calculatePlasticityIndex` → LL − PL ✓
- `getALinePI` → `0.73·(LL−20)` ✓
- `classifySoil` → CL / CH / ML / MH using A-line ✓

### Files modified

1. `src/context/TestDataContext.tsx` — type the timeout promise (fixes build error).
2. `src/lib/atterbergCalculations.ts` — make `calculateLiquidLimit` use the regression at 20 mm.
3. `src/components/soil/LiquidLimitSection.tsx` — linear Y-axis, extended regression line, LL marker dot, equation/R² caption, live computed values panel, optional A-line preview.
4. `src/components/soil/AtterbergTest.tsx` — pass `plasticLimit` and `passing425um` into `LiquidLimitSection`.

