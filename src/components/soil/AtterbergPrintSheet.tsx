import { useMemo } from "react";
import type {
  AtterbergRecord,
  LiquidLimitTest,
  PlasticLimitTest,
  ShrinkageLimitTest,
  LiquidLimitTrial,
  PlasticLimitTrial,
} from "@/context/TestDataContext";
import {
  calculateLinearShrinkage,
  calculateLiquidLimit,
  calculateModulusOfPlasticity,
  calculatePlasticLimit,
  calculatePlasticityIndex,
  getDrySoilMass,
  getTrialMoisture,
  getWaterMass,
} from "@/lib/atterbergCalculations";
import { classifySoilUSCS, classifySoilAASHTO } from "@/lib/soilClassification";
import LiquidLimitFlowChart from "./LiquidLimitFlowChart";

interface PrintProject {
  projectName?: string;
  clientName?: string;
  logoUrl?: string;
  contactsImageUrl?: string;
  stampImageUrl?: string;
}

interface Props {
  record: AtterbergRecord;
  project: PrintProject;
  projectState: { dateReported?: string; checkedBy?: string };
}

const fmt = (v: number | null | undefined, suffix = "") =>
  v === null || v === undefined || Number.isNaN(v) ? "-" : `${v}${suffix}`;

const cellNum = (s: string | undefined) =>
  s === undefined || s === null || s === "" ? "-" : s;

const AtterbergPrintSheet = ({ record, project, projectState }: Props) => {
  const llTest = record.tests.find((t): t is LiquidLimitTest => t.type === "liquidLimit") ?? null;
  const plTest = record.tests.find((t): t is PlasticLimitTest => t.type === "plasticLimit") ?? null;
  const lsTest = record.tests.find((t): t is ShrinkageLimitTest => t.type === "shrinkageLimit") ?? null;

  const llTrials: LiquidLimitTrial[] = llTest?.trials ?? [];
  const plTrials: PlasticLimitTrial[] = plTest?.trials ?? [];
  const lsTrial = lsTest?.trials[0];

  const liquidLimit = useMemo(() => (llTest ? calculateLiquidLimit(llTest.trials) : null), [llTest]);
  const plasticLimit = useMemo(() => (plTest ? calculatePlasticLimit(plTest.trials) : null), [plTest]);
  const linearShrinkage = useMemo(
    () => (lsTest ? calculateLinearShrinkage(lsTest.trials) : null),
    [lsTest],
  );
  const plasticityIndex = useMemo(
    () => calculatePlasticityIndex(liquidLimit, plasticLimit),
    [liquidLimit, plasticLimit],
  );
  const modulusOfPlasticity = useMemo(
    () => calculateModulusOfPlasticity(plasticityIndex, record.passing425um),
    [plasticityIndex, record.passing425um],
  );

  const { uscs, aashto } = useMemo(() => {
    const atterberg = {
      liquidLimit: liquidLimit ?? undefined,
      plasticLimit: plasticLimit ?? undefined,
      plasticityIndex: plasticityIndex ?? undefined,
    };
    const grain = { gravel: 0, sand: 0, fines: 100 };
    const u = classifySoilUSCS(grain, atterberg);
    const a = classifySoilAASHTO(grain, atterberg);
    return {
      uscs: liquidLimit === null && plasticityIndex === null
        ? { symbol: "—", description: "" }
        : { symbol: u.uscsSymbol, description: u.uscsDescription },
      aashto: liquidLimit === null && plasticityIndex === null ? "—" : a,
    };
  }, [liquidLimit, plasticLimit, plasticityIndex]);

  // Always pad LL to at least 4 cols, PL to at least 3 cols
  const llCols = Math.max(4, llTrials.length);
  const plCols = Math.max(3, plTrials.length);
  const llRows = Array.from({ length: llCols }, (_, i) => llTrials[i] ?? null);
  const plRows = Array.from({ length: plCols }, (_, i) => plTrials[i] ?? null);

  const llHeaders = llRows.map((_, i) => `LL${i + 1}`);
  const plHeaders = plRows.map((_, i) => `PL${i + 1}`);

  return (
    <div className="atterberg-print-sheet" data-print-sheet-content>
      {/* Header */}
      <div className="aps-header">
        <div className="aps-logo">
          {project.logoUrl ? <img src={project.logoUrl} alt="Logo" crossOrigin="anonymous" /> : null}
        </div>
        <div className="aps-contacts">
          {project.contactsImageUrl ? <img src={project.contactsImageUrl} alt="Contacts" crossOrigin="anonymous" /> : null}
        </div>
      </div>

      {/* Title bar */}
      <div className="aps-title-bar">ATTERBERG LIMITS (BS 1377 PART 2, 4.3 : 1990)</div>

      {/* Metadata */}
      <table className="aps-meta" style={{ marginLeft: '8mm', marginRight: '8mm', marginBottom: '2px' }}>
        <tbody>
          <tr>
            <td className="lbl" style={{ width: '25%' }}>Client:</td>
            <td colSpan={5} style={{ width: '75%' }}>{project.clientName || "-"}</td>
          </tr>
          <tr>
            <td className="lbl" style={{ width: '25%' }}>Project:</td>
            <td colSpan={5} style={{ width: '75%' }}>{project.projectName || "-"}</td>
          </tr>
          <tr>
            <td className="lbl" style={{ width: '15%' }}>Date Tested:</td>
            <td style={{ width: '20%' }}>{record.dateTested || "-"}</td>
            <td className="lbl" style={{ width: '20%' }}>Sample ID:</td>
            <td style={{ width: '20%' }}>{record.label || "-"}</td>
            <td className="lbl" style={{ width: '15%' }}>Depth (m):</td>
            <td style={{ width: '10%' }}>{record.sampleNumber || "-"}</td>
          </tr>
        </tbody>
      </table>

      {/* Trials table */}
      <div className="aps-section-bar">ATTERBERG LIMITS TEST</div>
      <table className="aps-trials">
        <thead>
          <tr>
            <th></th>
            {llHeaders.map((h, i) => (
              <th key={`llh-${i}`}>{h} {`(${llRows[i]?.containerNo || ""})`}</th>
            ))}
            {plHeaders.map((h, i) => (
              <th key={`plh-${i}`} className="pl-cell">{h} {`(${plRows[i]?.containerNo || ""})`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="lbl">Container No</td>
            {llRows.map((t, i) => <td key={`ll-cn-${i}`}>{cellNum(t?.containerNo)}</td>)}
            {plRows.map((t, i) => <td key={`pl-cn-${i}`} className="pl-cell">{cellNum(t?.containerNo)}</td>)}
          </tr>
          <tr>
            <td className="lbl">Penetration (mm)</td>
            {llRows.map((t, i) => <td key={`ll-p-${i}`}>{cellNum(t?.penetration)}</td>)}
            {plRows.map((_, i) => <td key={`pl-p-${i}`} className="pl-cell">-</td>)}
          </tr>
          <tr>
            <td className="lbl">Cont + Wet Soil (g)</td>
            {llRows.map((t, i) => <td key={`ll-w-${i}`}>{cellNum(t?.containerWetMass)}</td>)}
            {plRows.map((t, i) => <td key={`pl-w-${i}`} className="pl-cell">{cellNum(t?.containerWetMass)}</td>)}
          </tr>
          <tr>
            <td className="lbl">Cont + Dry Soil (g)</td>
            {llRows.map((t, i) => <td key={`ll-d-${i}`}>{cellNum(t?.containerDryMass)}</td>)}
            {plRows.map((t, i) => <td key={`pl-d-${i}`} className="pl-cell">{cellNum(t?.containerDryMass)}</td>)}
          </tr>
          <tr>
            <td className="lbl">Container (g)</td>
            {llRows.map((t, i) => <td key={`ll-c-${i}`}>{cellNum(t?.containerMass)}</td>)}
            {plRows.map((t, i) => <td key={`pl-c-${i}`} className="pl-cell">{cellNum(t?.containerMass)}</td>)}
          </tr>
          <tr>
            <td className="lbl">Wt Moisture (g)</td>
            {llRows.map((t, i) => <td key={`ll-mw-${i}`}>{t ? (getWaterMass(t) ?? "-") : "-"}</td>)}
            {plRows.map((t, i) => <td key={`pl-mw-${i}`} className="pl-cell">{t ? (getWaterMass(t) ?? "-") : "-"}</td>)}
          </tr>
          <tr>
            <td className="lbl">Wt Dry Soil (g)</td>
            {llRows.map((t, i) => <td key={`ll-ds-${i}`}>{t ? (getDrySoilMass(t) ?? "-") : "-"}</td>)}
            {plRows.map((t, i) => <td key={`pl-ds-${i}`} className="pl-cell">{t ? (getDrySoilMass(t) ?? "-") : "-"}</td>)}
          </tr>
          <tr>
            <td className="lbl">Moisture Content (%)</td>
            {llRows.map((t, i) => {
              const m = t ? getTrialMoisture(t) : null;
              return <td key={`ll-mc-${i}`}><strong>{m === null || m === "" ? "-" : m}</strong></td>;
            })}
            {plRows.map((t, i) => {
              const m = t ? getTrialMoisture(t) : null;
              return <td key={`pl-mc-${i}`} className="pl-cell"><strong>{m === null || m === "" ? "-" : m}</strong></td>;
            })}
          </tr>
          <tr>
            <td className="lbl">PLASTIC LIMIT</td>
            <td colSpan={llCols}></td>
            <td colSpan={plCols} className="pl-cell"><strong>{fmt(plasticLimit)}</strong></td>
          </tr>
        </tbody>
      </table>

      {/* Chart + side panels */}
      <div className="aps-grid" style={{ pageBreakInside: 'avoid' }}>
        <div className="aps-chart-box">
          <LiquidLimitFlowChart trials={llTrials} width={700} height={900} />
        </div>
        <div className="aps-side">
          <div className="aps-section-bar">LINEAR SHRINKAGE</div>
          <table className="aps-kv">
            <tbody>
              <tr><td className="lbl">Initial length (mm)</td><td>{lsTrial?.initialLength || "-"}</td></tr>
              <tr><td className="lbl">Final length (mm)</td><td>{lsTrial?.finalLength || "-"}</td></tr>
              <tr><td className="lbl">Shrinkage (%)</td><td>{fmt(linearShrinkage)}</td></tr>
            </tbody>
          </table>

          <div className="aps-section-bar">RESULTS SUMMARY</div>
          <table className="aps-kv">
            <tbody>
              <tr><td className="lbl">LIQUID LIMIT (%)</td><td>{fmt(liquidLimit)}</td></tr>
              <tr><td className="lbl">PLASTIC LIMIT (%)</td><td>{fmt(plasticLimit)}</td></tr>
              <tr><td className="lbl">PLASTICITY INDEX (%)</td><td>{fmt(plasticityIndex)}</td></tr>
              <tr><td className="lbl">Passing 425 µm (%)</td><td>{record.passing425um || "-"}</td></tr>
              <tr><td className="lbl">MODULUS OF PLASTICITY</td><td>{fmt(modulusOfPlasticity)}</td></tr>
              <tr><td className="lbl">LINEAR SHRINKAGE (%)</td><td>{fmt(linearShrinkage)}</td></tr>
            </tbody>
          </table>

          <div className="aps-section-bar">SOIL CLASSIFICATION</div>
          <table className="aps-kv">
            <tbody>
              <tr>
                <td className="lbl">USCS</td>
                <td>{uscs.description}</td>
                <td className="strong">{uscs.symbol}</td>
              </tr>
              <tr>
                <td className="lbl">AASHTO</td>
                <td colSpan={2}>{aashto}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="aps-footer">
        <div><span className="lbl">Tested by:</span> {record.testedBy || "_______________"}</div>
        <div><span className="lbl">Date reported:</span> {projectState.dateReported || "_______________"}</div>
        <div className="aps-checked">
          <span className="lbl">Checked by:</span> {projectState.checkedBy || "_______________"}
          {project.stampImageUrl ? <img src={project.stampImageUrl} alt="Stamp" className="aps-stamp" crossOrigin="anonymous" /> : null}
        </div>
      </div>
    </div>
  );
};

export default AtterbergPrintSheet;
