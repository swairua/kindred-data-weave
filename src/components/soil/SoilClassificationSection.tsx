import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";
import type { CalculatedResults } from "@/context/TestDataContext";
import {
  classifySoilUSCS,
  classifySoilAASHTO,
  calculatePlasticityChart,
  validateClassificationData,
  type GrainSizeDistribution,
} from "@/lib/soilClassification";
import { cn } from "@/lib/utils";

interface SoilClassificationSectionProps {
  atterbergResults: CalculatedResults;
  grainSizeData?: {
    gravel: string;
    sand: string;
    fines: string;
  };
  onGrainSizeChange?: (field: "gravel" | "sand" | "fines", value: string) => void;
}

const sanitizeNumericInput = (value: string) => {
  const normalized = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [whole = "", ...fraction] = normalized.split(".");
  return fraction.length > 0 ? `${whole}.${fraction.join("")}` : whole;
};

const SoilClassificationSection = ({
  atterbergResults,
  grainSizeData,
  onGrainSizeChange,
}: SoilClassificationSectionProps) => {
  const grainSize: GrainSizeDistribution | null = useMemo(() => {
    if (!grainSizeData) return null;
    const gravel = Number(grainSizeData.gravel);
    const sand = Number(grainSizeData.sand);
    const fines = Number(grainSizeData.fines);

    if (isNaN(gravel) || isNaN(sand) || isNaN(fines)) return null;
    return { gravel, sand, fines };
  }, [grainSizeData]);

  const validation = useMemo(
    () => validateClassificationData(grainSize, atterbergResults),
    [grainSize, atterbergResults],
  );

  const classification = useMemo(() => {
    if (!grainSize) return null;
    return classifySoilUSCS(grainSize, atterbergResults);
  }, [grainSize, atterbergResults]);

  const aashtoGroup = useMemo(() => {
    if (!grainSize) return null;
    return classifySoilAASHTO(grainSize, atterbergResults);
  }, [grainSize, atterbergResults]);

  const plasticityInfo = useMemo(
    () => calculatePlasticityChart(atterbergResults.liquidLimit, atterbergResults.plasticityIndex),
    [atterbergResults.liquidLimit, atterbergResults.plasticityIndex],
  );

  const grainSizeTotal = useMemo(() => {
    if (!grainSizeData) return 0;
    const sum =
      (Number(grainSizeData.gravel) || 0) +
      (Number(grainSizeData.sand) || 0) +
      (Number(grainSizeData.fines) || 0);
    return sum;
  }, [grainSizeData]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Soil Classification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Grain Size Input */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Grain Size Distribution (%)</Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Gravel (%)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={grainSizeData?.gravel || ""}
                  onChange={(e) => onGrainSizeChange?.("gravel", sanitizeNumericInput(e.target.value))}
                  placeholder="0"
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Sand (%)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={grainSizeData?.sand || ""}
                  onChange={(e) => onGrainSizeChange?.("sand", sanitizeNumericInput(e.target.value))}
                  placeholder="0"
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fines (%)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={grainSizeData?.fines || ""}
                  onChange={(e) => onGrainSizeChange?.("fines", sanitizeNumericInput(e.target.value))}
                  placeholder="0"
                  className="h-8"
                />
              </div>
            </div>
            <p
              className={cn(
                "text-xs text-muted-foreground",
                grainSizeTotal > 0 && Math.abs(grainSizeTotal - 100) > 0.1 && "text-amber-600",
              )}
            >
              Total: {grainSizeTotal.toFixed(1)}%
            </p>
          </div>

          {/* Validation Errors */}
          {!validation.valid && (
            <Alert variant="destructive" className="bg-red-50 dark:bg-red-950">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">Missing or invalid data:</p>
                <ul className="list-disc pl-5 mt-1">
                  {validation.missingData.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Classification Results */}
          {validation.valid && classification && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">USCS Classification</Label>
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1">{classification.uscsSymbol}</p>
                  <p className="text-xs text-muted-foreground mt-1">{classification.uscsGroup}</p>
                  <p className="text-xs text-foreground mt-1">{classification.uscsDescription}</p>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">AASHTO Classification</Label>
                  <p className="text-sm font-bold text-green-600 dark:text-green-400 mt-1">{aashtoGroup}</p>
                  <p className="text-xs text-foreground mt-1">{classification.aashtoDescription}</p>
                </div>
              </div>

              {plasticityInfo && (
                <div className="rounded-lg border bg-card p-3 space-y-2">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Soil Characteristics</Label>
                    <p className="text-sm font-semibold text-purple-600 dark:text-purple-400 mt-1">
                      {plasticityInfo.classification}
                    </p>
                    <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                      {plasticityInfo.characteristics.map((char, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-current rounded-full" />
                          {char}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground italic">
                Classification based on Unified Soil Classification System (USCS) and AASHTO standards.
              </p>
            </div>
          )}

          {grainSizeTotal === 0 && (
            <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                Enter grain size distribution data to calculate soil classification.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SoilClassificationSection;
