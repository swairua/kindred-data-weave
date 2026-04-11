import { ReactNode, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, FileDown, FileSpreadsheet, FlaskConical, Loader2, Save, Sheet, Trash2 } from "lucide-react";
import { toast } from "sonner";

type SmokeCheckItemStatus = "idle" | "running" | "success" | "error";

type SmokeCheckStatus = {
  state: SmokeCheckItemStatus;
  pdf: SmokeCheckItemStatus;
  xlsx: SmokeCheckItemStatus;
  message: string;
  detail?: string;
};

interface TestSectionProps {
  title: string;
  children: ReactNode;
  onSave?: () => void | boolean | Promise<void | boolean>;
  onClear?: () => void;
  onExportPDF?: () => boolean | void | Promise<boolean | void>;
  onExportCSV?: () => boolean | void;
  onExportXLSX?: () => boolean | void | Promise<boolean | void>;
  onExportSmokeCheck?: () => boolean | void | Promise<boolean | void>;
  exportSmokeCheckDisabled?: boolean;
  smokeCheckStatus?: SmokeCheckStatus | null;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  lastSavedAt?: string | null;
  lastSaveError?: string | null;
}

const TestSection = ({ title, children, onSave, onClear, onExportPDF, onExportCSV, onExportXLSX, onExportSmokeCheck, exportSmokeCheckDisabled, smokeCheckStatus, saveStatus = "idle", lastSavedAt, lastSaveError }: TestSectionProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Card className="shadow-sm">
      <CardHeader
        className="cursor-pointer select-none py-3 px-4"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {title}
          </CardTitle>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {onExportSmokeCheck && (
              <Button
                size="sm"
                variant="secondary"
                disabled={exportSmokeCheckDisabled}
                onClick={async () => {
                  await onExportSmokeCheck();
                }}
              >
                <FlaskConical className="h-3.5 w-3.5 mr-1" /> Smoke Check
              </Button>
            )}
            {onExportXLSX && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const exported = await onExportXLSX();
                  if (exported !== false) toast.success(`${title} Excel downloaded`);
                }}
              >
                <Sheet className="h-3.5 w-3.5 mr-1" /> Excel
              </Button>
            )}
            {onExportCSV && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const exported = onExportCSV();
                  if (exported !== false) toast.success(`${title} CSV downloaded`);
                }}
              >
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
            )}
            {onExportPDF && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    const exported = await onExportPDF();
                    if (exported !== false) toast.success(`${title} PDF downloaded`);
                  } catch {
                    toast.error(`${title} PDF download failed`);
                  }
                }}
              >
                <FileDown className="h-3.5 w-3.5 mr-1" /> PDF
              </Button>
            )}
            {onSave && (
              <Button
                size="sm"
                variant={saveStatus === "error" ? "destructive" : "default"}
                disabled={saveStatus === "saving"}
                onClick={async () => {
                  try {
                    const result = await onSave();
                    if (result !== false) {
                      toast.success(`${title} saved`);
                    }
                  } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : `${title} save failed`;
                    toast.error(errorMsg);
                  }
                }}
              >
                {saveStatus === "saving" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...
                  </>
                ) : saveStatus === "saved" ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-600" /> Saved
                  </>
                ) : saveStatus === "error" ? (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 mr-1" /> Error
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5 mr-1" /> Save
                  </>
                )}
              </Button>
            )}
            {onClear && (
              <Button size="sm" variant="outline" onClick={onClear}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>
        {saveStatus && saveStatus !== "idle" && (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-xs ${
              saveStatus === "saved"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : saveStatus === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            <div className="flex items-start gap-2">
              {saveStatus === "saving" ? (
                <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin" />
              ) : saveStatus === "saved" ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
              )}
              <div className="min-w-0 space-y-1">
                <div className="font-medium">
                  {saveStatus === "saving"
                    ? "Saving in progress..."
                    : saveStatus === "saved"
                      ? "Saved successfully"
                      : "Save failed"}
                </div>
                {lastSavedAt && saveStatus === "saved" && (
                  <div className="text-current/80">
                    Last saved at {lastSavedAt}
                    <br />
                    <span className="text-xs">You can continue editing and add more tests anytime.</span>
                  </div>
                )}
                {lastSaveError && saveStatus === "error" && (
                  <div className="text-current/80">{lastSaveError}</div>
                )}
              </div>
            </div>
          </div>
        )}
        {smokeCheckStatus && smokeCheckStatus.state !== "idle" && (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-xs ${
              smokeCheckStatus.state === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : smokeCheckStatus.state === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            <div className="flex items-start gap-2">
              {smokeCheckStatus.state === "running" ? (
                <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin" />
              ) : smokeCheckStatus.state === "success" ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
              )}
              <div className="min-w-0 space-y-1">
                <div className="font-medium">{smokeCheckStatus.message}</div>
                {smokeCheckStatus.detail && <div className="text-current/80">{smokeCheckStatus.detail}</div>}
                <div className="grid gap-1 pt-1">
                  {[
                    ["PDF", smokeCheckStatus.pdf],
                    ["Excel", smokeCheckStatus.xlsx],
                  ].map(([label, status]) => (
                    <div key={label} className="flex items-center gap-2">
                      {status === "running" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : status === "success" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : status === "error" ? (
                        <AlertCircle className="h-3.5 w-3.5" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-current/40" />
                      )}
                      <span className="font-medium">{label}</span>
                      <span className="text-current/70">{status === "success" ? "complete" : status === "running" ? "running" : status === "error" ? "failed" : "idle"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      {open && <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>}
    </Card>
  );
};

export default TestSection;
