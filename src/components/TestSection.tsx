import { ReactNode, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, FileDown, FlaskConical, Loader2, Save, Sheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import ProjectHeader from "@/components/ProjectHeader";
import { useProject } from "@/context/ProjectContext";

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
  tooltip?: string;
  children: ReactNode;
  onSave?: () => void | boolean | Promise<void | boolean>;
  onFinalSave?: () => void | Promise<void>;
  onClear?: () => void;
  onExportPDF?: () => boolean | void | Promise<boolean | void>;
  onExportXLSX?: () => boolean | void | Promise<boolean | void>;
  onExportSmokeCheck?: () => boolean | void | Promise<boolean | void>;
  exportSmokeCheckDisabled?: boolean;
  smokeCheckStatus?: SmokeCheckStatus | null;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  lastSavedAt?: string | null;
  lastSaveError?: string | null;
}

const TestSection = ({ title, tooltip, children, onSave, onFinalSave, onClear, onExportPDF, onExportXLSX, onExportSmokeCheck, exportSmokeCheckDisabled, smokeCheckStatus, saveStatus = "idle", lastSavedAt, lastSaveError }: TestSectionProps) => {
  const [open, setOpen] = useState(false);
  const project = useProject();
  const hasHeaderHandlers =
    !!project.onProjectNameChange &&
    !!project.onClientNameChange &&
    !!project.onLoadProject &&
    !!project.onStartNewProject &&
    !!project.onMetadataChange;

  return (
    <Card className="shadow-sm">
      <CardHeader
        className="cursor-pointer select-none py-3 px-4"
        onClick={() => setOpen(!open)}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle
            className="text-base font-semibold flex items-center gap-2 group"
            tooltip={tooltip}
            tooltipSide="right"
          >
            <span
              className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-all duration-200 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 group-hover:shadow-md flex-shrink-0"
              title={open ? "Click to collapse" : "Click to expand"}
            >
              {open ? <ChevronDown className="h-5 w-5 transition-transform group-hover:scale-110" /> : <ChevronRight className="h-5 w-5 transition-transform group-hover:scale-110" />}
            </span>
            <span className="min-w-0">{title}</span>
          </CardTitle>
          <div className="flex flex-wrap gap-2 justify-start sm:justify-end" onClick={(e) => e.stopPropagation()}>
            {onExportSmokeCheck && (
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent side="top">
                  Run diagnostic checks on test data
                </TooltipContent>
              </Tooltip>
            )}
            {onExportXLSX && (
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent side="top">
                  Export test data as Excel file
                </TooltipContent>
              </Tooltip>
            )}
            {onExportPDF && (
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent side="top">
                  Export test data as PDF document
                </TooltipContent>
              </Tooltip>
            )}
            {onSave && (
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent side="top">
                  Save changes without closing
                </TooltipContent>
              </Tooltip>
            )}
            {onFinalSave && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="default"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={saveStatus === "saving"}
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await onFinalSave();
                      } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : "Final save failed";
                        toast.error(errorMsg);
                      }
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {"Save & Close"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Save changes and close this section
                </TooltipContent>
              </Tooltip>
            )}
            {onClear && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={onClear}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Clear all data in this section
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {saveStatus && saveStatus !== "idle" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`mt-3 rounded-md border px-3 py-2 text-xs cursor-help ${
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
            </TooltipTrigger>
            <TooltipContent side="right">
              {saveStatus === "saving"
                ? "Saving your changes to the server..."
                : saveStatus === "saved"
                  ? `Last saved at ${lastSavedAt || "unknown time"}`
                  : lastSaveError || "An error occurred while saving"}
            </TooltipContent>
          </Tooltip>
        )}
        {smokeCheckStatus && smokeCheckStatus.state !== "idle" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`mt-3 rounded-md border px-3 py-2 text-xs cursor-help ${
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
            </TooltipTrigger>
            <TooltipContent side="right">
              {smokeCheckStatus.state === "running"
                ? "Smoke check tests are running..."
                : smokeCheckStatus.state === "success"
                  ? "All smoke check tests completed successfully"
                  : smokeCheckStatus.detail || "Smoke check encountered an error"}
            </TooltipContent>
          </Tooltip>
        )}
      </CardHeader>
      {open && (
        <CardContent className="px-4 pb-4 pt-0 space-y-4">
          {hasHeaderHandlers && (
            <div className="rounded-md border bg-muted/20 p-4 print:hidden">
              <ProjectHeader
                projectName={project.projectName}
                clientName={project.clientName}
                date={project.date}
                projectHistory={project.projectHistory ?? []}
                isLoadingProjects={project.isLoadingProjects ?? false}
                projectMetadata={project.projectMetadata ?? {}}
                onProjectNameChange={project.onProjectNameChange!}
                onClientNameChange={project.onClientNameChange!}
                onLoadProject={project.onLoadProject!}
                onStartNewProject={project.onStartNewProject!}
                onMetadataChange={project.onMetadataChange!}
              />
            </div>
          )}
          {children}
        </CardContent>
      )}
    </Card>
  );
};

export default TestSection;
