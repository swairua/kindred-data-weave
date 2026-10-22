import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import Navigation from "@/components/Navigation";
import { listReceptionConsignments, listReceptionFieldDefinitions, listReceptionPhotos, saveReceptionConsignment } from "@/lib/api";
import {
  RECEPTION_TEST_CODES,
  SAMPLE_TYPE_CONTAINERS,
  consignmentIsOnHold,
  emptyReceptionConsignment,
  emptyReceptionSample,
  isSampleOnHold,
  nextLabId,
  nextRcNo,
  receptionSummary,
  sampleTypeTag,
  type ReceptionCondition,
  type ReceptionConsignmentInput,
  type ReceptionFieldDefinition,
  type ReceptionSampleInput,
} from "@/lib/reception";
import { generateReceptionAckPDF } from "@/lib/receptionAckPdfGenerator";
import { useSession } from "@/context/SessionContext";
import { CustomFieldsEditor } from "@/components/reception/CustomFieldsEditor";
import { ConsignmentPhotos } from "@/components/reception/ConsignmentPhotos";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, Loader2, Plus, Trash2 } from "lucide-react";

const CONDITIONS: ReceptionCondition[] = ["Intact", "Disturbed", "Seal broken", "Too little"];

const SAMPLE_TYPES = Object.keys(SAMPLE_TYPE_CONTAINERS);

/** Test-code legend shown under the requested-tests matrix. */
const TEST_CODE_LABELS: Record<string, string> = {
  MC: "Moisture content",
  PSD: "Particle size (sieve)",
  HYD: "Hydrometer",
  ATT: "Liquid & plastic limits",
  CMP: "Compaction",
  CBR: "CBR",
  UU: "UU triaxial",
  CON: "Oedometer consolidation",
  CHEM: "Sulfate, chloride, pH",
};

const STORAGE_OPTIONS = [
  "Auto by type · U100 → cold room, bulk → racks",
  "Cold room (U100)",
  "Curing tank (cubes)",
  "Bulk racks",
  "Ambient store",
];

const METHOD_SETS = ["BS 1377-2:2022", "BS 1377-1:2016", "BS EN 12390-3:2019"];

const TRANSPORT_CHECKS = [
  ["coolBox", "Cool box used for U100s"],
  ["tubesUpright", "Tubes upright & padded"],
  ["fieldLog", "Field log sheet attached"],
] as const;

/** Field-level validation for the wizard. Returns a list of human messages. */
const validateConsignment = (draft: ReceptionConsignmentInput): string[] => {
  const errors: string[] = [];
  if (!draft.client.trim()) errors.push("Client is required.");
  if (!draft.jobNo.trim()) errors.push("Job / project is required.");
  if (!draft.deliveredBy.trim()) errors.push("Delivered by is required.");
  if (!draft.receivedBy.trim()) errors.push("Received by is required.");
  if (draft.samples.length === 0) errors.push("Add at least one sample.");
  draft.samples.forEach((sample, index) => {
    if (!sample.labId.trim()) errors.push(`Sample ${index + 1} needs a Lab ID.`);
    if (!sample.clientMark.trim()) errors.push(`Sample ${index + 1} needs a client mark.`);
    if (sample.tests.length === 0) errors.push(`Sample ${index + 1} needs at least one test.`);
  });
  return errors;
};

const LogConsignment = () => {
  const navigate = useNavigate();
  const { rcNo } = useParams();
  const { user } = useSession();
  const [draft, setDraft] = useState<ReceptionConsignmentInput>(() => emptyReceptionConsignment("RC-26-0001"));
  const [loaded, setLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldDefs, setFieldDefs] = useState<ReceptionFieldDefinition[]>([]);
  const [defsLoaded, setDefsLoaded] = useState(false);

  // Load the consignment being edited, or seed a brand new draft with the next
  // consignment number and the first Lab ID of the job.
  useEffect(() => {
    let active = true;
    Promise.all([listReceptionConsignments(), listReceptionFieldDefinitions()])
      .then(([rows, defs]) => {
        if (!active) return;
        setFieldDefs(defs);
        setDefsLoaded(true);
        if (rcNo && rcNo !== "new") {
          const match = rows.find((r) => r.rcNo === decodeURIComponent(rcNo));
          if (match) setDraft({ ...match, transportChecks: match.transportChecks ?? {} });
        } else {
          const fresh = emptyReceptionConsignment(nextRcNo(rows.map((r) => r.rcNo)));
          const jobNo = fresh.jobNo || "JOB";
          setDraft({
            ...fresh,
            // The signed-in technician is the default receiver; they can type over it.
            receivedBy: user?.name || "",
            samples: [emptyReceptionSample(nextLabId(jobNo, []))],
          });
        }
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setLoaded(true);
          setDefsLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [rcNo]);

  const summary = useMemo(() => receptionSummary(draft.samples), [draft.samples]);

  const patchDraft = (patch: Partial<ReceptionConsignmentInput>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const patchSample = (index: number, patch: Partial<ReceptionSampleInput>) =>
    setDraft((prev) => ({
      ...prev,
      samples: prev.samples.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));

  /** Adds a sample carrying the next sequential Lab ID for the job. */
  const addSample = () =>
    setDraft((prev) => {
      const jobNo = prev.jobNo || "JOB";
      const labId = nextLabId(jobNo, prev.samples.map((s) => s.labId));
      return { ...prev, samples: [...prev.samples, emptyReceptionSample(labId)] };
    });

  const removeSample = (index: number) =>
    setDraft((prev) => ({ ...prev, samples: prev.samples.filter((_, i) => i !== index) }));

  /** Toggles one test code on a sample. */
  const toggleTest = (index: number, code: string) =>
    setDraft((prev) => ({
      ...prev,
      samples: prev.samples.map((s, i) => {
        if (i !== index) return s;
        const has = s.tests.includes(code);
        return { ...s, tests: has ? s.tests.filter((t) => t !== code) : [...s.tests, code] };
      }),
    }));

  const toggleTransportCheck = (key: "coolBox" | "tubesUpright" | "fieldLog") =>
    setDraft((prev) => ({
      ...prev,
      transportChecks: {
        ...(prev.transportChecks ?? {}),
        [key]: !(prev.transportChecks?.[key] ?? false),
      },
    }));

  /** Persists the consignment and returns the stored copy. */
  const persist = async (
    status: ReceptionConsignmentInput["status"],
  ): Promise<ReceptionConsignmentInput> => {
    const toStore: ReceptionConsignmentInput = {
      ...draft,
      status,
      receivedBy: draft.receivedBy || user?.name || "",
    };
    await saveReceptionConsignment(toStore);
    setDraft(toStore);
    return toStore;
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      await persist("draft");
      toast.success("Draft saved");
    } catch {
      toast.error("Couldn't save the draft");
    } finally {
      setIsSaving(false);
    }
  };

  /** Prints the sample receipt acknowledgement for the given consignment. */
  const handlePrint = async (consignment: ReceptionConsignmentInput) => {
    setIsPrinting(true);
    try {
      await generateReceptionAckPDF({ ...consignment, skipDownload: false });
    } catch (error) {
      console.error("[Reception] Acknowledgement PDF failed:", error);
      toast.error("Couldn't print the acknowledgement");
    } finally {
      setIsPrinting(false);
    }
  };

  const handleReceive = async () => {
    // Default the receiver to the signed-in technician before validating, so a
    // first-time user does not have to retype their own name to receive.
    const prepared: ReceptionConsignmentInput = {
      ...draft,
      receivedBy: draft.receivedBy || user?.name || "",
    };
    const found = validateConsignment(prepared);
    setErrors(found);
    if (found.length > 0) {
      toast.error(found[0]);
      return;
    }
    setIsSaving(true);
    try {
      setDraft(prepared);
      // When receiving, always determine status from samples — never preserve
      // the draft status.
      const toStore: ReceptionConsignmentInput = {
        ...prepared,
        status: consignmentIsOnHold(prepared) ? "on-hold" : "logged",
      };
      await saveReceptionConsignment(toStore);
      setDraft(toStore);
      toast.success(
        toStore.status === "on-hold"
          ? `Received · ${summary.onHold} on hold · acknowledgement printing`
          : "Received · acknowledgement printing",
      );
      await handlePrint(toStore);
      navigate("/reception");
    } catch {
      toast.error("Couldn't save the consignment");
    } finally {
      setIsSaving(false);
    }
  };

  const heldSamples = draft.samples.filter((s) => isSampleOnHold(s.condition));

  return (
    <SidebarProvider>
      <Navigation currentView="reception" onViewChange={() => {}} />
      <SidebarInset>
        <div className="min-h-screen bg-muted/30">
          <header className="flex flex-col items-start gap-2 bg-[#1d2b26] px-4 py-3 text-white sm:flex-row sm:items-center sm:gap-3">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 w-full sm:w-auto" onClick={() => navigate("/reception")}>
              <ArrowLeft className="h-4 w-4" /> Reception
            </Button>
            <div className="flex items-center gap-3 w-full sm:w-auto sm:ml-auto">
              <h1 className="text-sm font-semibold">Log a consignment</h1>
              <span className="text-xs text-emerald-200 whitespace-nowrap">
                {draft.rcNo} · {draft.status}
              </span>
            </div>
          </header>

          {/* Wizard steps */}
          <ol className="flex flex-wrap items-center gap-2 border-b bg-white px-6 py-3 text-sm">
            {[
              { id: "1", label: "Consignment", done: draft.client.trim() !== "" },
              { id: "2", label: "Samples & condition", done: summary.samples > 0 },
              { id: "3", label: "Tests requested", done: summary.tests > 0 },
              { id: "4", label: "Receive, label, store", done: false },
            ].map((step, i) => (
              <li key={step.id} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-6 bg-border" />}
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    step.done ? "bg-[#0f6b5c] text-white" : "border border-border text-muted-foreground"
                  }`}
                >
                  {step.done ? <Check className="h-3.5 w-3.5" /> : step.id}
                </span>
                <span className={step.done ? "font-medium" : "text-muted-foreground"}>{step.label}</span>
              </li>
            ))}
          </ol>

          <main className="grid gap-4 px-4 py-4 sm:px-6 sm:py-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              {/* 1 · Consignment */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">1 · Consignment</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="lc-client">Client</Label>
                    <Input
                      id="lc-client"
                      value={draft.client}
                      onChange={(e) => patchDraft({ client: e.target.value })}
                      placeholder="Kenya Railways"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lc-job">Job / project</Label>
                    <Input
                      id="lc-job"
                      value={draft.jobNo}
                      onChange={(e) => patchDraft({ jobNo: e.target.value })}
                      placeholder="26-0418"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lc-project">Project</Label>
                    <Input
                      id="lc-project"
                      value={draft.project}
                      onChange={(e) => patchDraft({ project: e.target.value })}
                      placeholder="KUMIP Line 1"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lc-clientref">Client request form ref.</Label>
                    <Input
                      id="lc-clientref"
                      value={draft.clientRef}
                      onChange={(e) => patchDraft({ clientRef: e.target.value })}
                      placeholder="KR-SSF-0093"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lc-delivered">Delivered by</Label>
                    <Input
                      id="lc-delivered"
                      value={draft.deliveredBy}
                      onChange={(e) => patchDraft({ deliveredBy: e.target.value })}
                      placeholder="Joel Wairua (CMTC field team)"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lc-vehicle">Vehicle reg.</Label>
                    <Input
                      id="lc-vehicle"
                      value={draft.vehicleReg}
                      onChange={(e) => patchDraft({ vehicleReg: e.target.value })}
                      placeholder="KDx 000X"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lc-received">Received · date & time</Label>
                    <Input
                      id="lc-received"
                      type="datetime-local"
                      value={draft.receivedAt}
                      onChange={(e) => patchDraft({ receivedAt: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lc-castdate">Cubes cast on</Label>
                    <Input
                      id="lc-castdate"
                      type="date"
                      value={draft.cubeCastDate ?? ""}
                      onChange={(e) => patchDraft({ cubeCastDate: e.target.value })}
                    />
                  </div>

                  {defsLoaded && (
                    <CustomFieldsEditor
                      area="consignment"
                      fields={draft.customFields ?? []}
                      definitions={fieldDefs}
                      onChange={(next) => patchDraft({ customFields: next })}
                    />
                  )}


                  <div className="space-y-1.5 sm:col-span-3">
                    <Label>Transport check</Label>
                    <div className="flex flex-wrap gap-5 pt-1">
                      {TRANSPORT_CHECKS.map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={draft.transportChecks?.[key] ?? false}
                            onCheckedChange={() => toggleTransportCheck(key)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {defsLoaded && (
                      <CustomFieldsEditor
                        area="transport"
                        fields={draft.transportCustomFields ?? []}
                        definitions={fieldDefs}
                        onChange={(next) => patchDraft({ transportCustomFields: next })}
                      />
                    )}
                  </div>

                  <div className="sm:col-span-3">
                    <ConsignmentPhotos
                      rcNo={draft.rcNo}
                      photos={draft.photos ?? []}
                      onChange={(next) => patchDraft({ photos: next })}
                      disabled={!draft.rcNo || draft.rcNo === "RC-26-0001"}
                    />
                  </div>
                </CardContent>
              </Card>
              {/* 2 · Samples & condition */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm">2 · Samples & condition on receipt</CardTitle>
                  <Button variant="outline" size="sm" className="gap-1.5 w-full sm:w-auto" onClick={addSample}>
                    <Plus className="h-4 w-4" /> Add sample
                  </Button>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Lab ID</th>
                        <th className="px-3 py-2 font-medium">Client mark</th>
                        <th className="px-3 py-2 font-medium">Location · depth (m)</th>
                        <th className="px-3 py-2 font-medium">Type · container</th>
                        <th className="px-3 py-2 font-medium">Mass (kg)</th>
                        <th className="px-3 py-2 font-medium">Condition</th>
                        <th className="px-3 py-2 font-medium">Fields</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.samples.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                            No samples yet — use “Add sample”.
                          </td>
                        </tr>
                      )}



                      {draft.samples.map((sample, index) => (
                        <tr
                          key={index}
                          className={`border-b align-top ${isSampleOnHold(sample.condition) ? "bg-amber-50/70" : ""}`}
                        >
                          <td className="px-3 py-3">
                            <Input
                              value={sample.labId}
                              onChange={(e) => patchSample(index, { labId: e.target.value })}
                              className="h-8 w-28 font-mono text-xs"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              value={sample.clientMark}
                              onChange={(e) => patchSample(index, { clientMark: e.target.value })}
                              className="h-8 w-28 text-xs"
                              placeholder="BH07-D1"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              value={sample.location}
                              onChange={(e) => patchSample(index, { location: e.target.value })}
                              className="h-8 w-24 text-xs"
                              placeholder="BH07"
                            />
                            <Input
                              value={sample.depthLabel}
                              onChange={(e) => patchSample(index, { depthLabel: e.target.value })}
                              className="mt-1 h-8 w-28 text-xs"
                              placeholder="0.50–1.00"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Select
                              value={sample.sampleType || undefined}
                              onValueChange={(value) =>
                                patchSample(index, {
                                  sampleType: value,
                                  container: SAMPLE_TYPE_CONTAINERS[value] ?? sample.container,
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-full sm:w-48 text-xs">
                                <SelectValue placeholder="Sample type" />
                              </SelectTrigger>
                              <SelectContent>
                                {SAMPLE_TYPES.map((type) => (
                                  <SelectItem key={type} value={type} className="text-xs">
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {sample.container || SAMPLE_TYPE_CONTAINERS[sample.sampleType] || "—"}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              value={sample.massKg}
                              onChange={(e) => patchSample(index, { massKg: e.target.value })}
                              className="h-8 w-20 text-xs"
                              placeholder="18.4"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {CONDITIONS.map((condition) => {
                                const active = sample.condition === condition;
                                const held = isSampleOnHold(condition);
                                return (
                                  <button
                                    key={condition}
                                    type="button"
                                    onClick={() => patchSample(index, { condition })}
                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                      active
                                        ? held
                                          ? "border-amber-700 bg-amber-700 text-white"
                                          : "border-foreground bg-foreground text-background"
                                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                                    }`}
                                  >
                                    {condition}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="space-y-1">
                              {defsLoaded && (
                                <CustomFieldsEditor
                                  area="sample"
                                  fields={sample.customFields ?? []}
                                  definitions={fieldDefs}
                                  onChange={(next) => patchSample(index, { customFields: next })}
                                />
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeSample(index)}
                              aria-label={`Remove sample ${sample.labId || index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* 3 · Tests requested */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm">3 · Tests requested</CardTitle>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="lc-methodset" className="text-xs text-muted-foreground">
                      Method set
                    </Label>
                    <Select value={draft.methodSet} onValueChange={(value) => patchDraft({ methodSet: value })}>
                      <SelectTrigger id="lc-methodset" className="h-9 w-48 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METHOD_SETS.map((set) => (
                          <SelectItem key={set} value={set} className="text-xs">
                            {set}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Sample</th>
                        {RECEPTION_TEST_CODES.map((code) => (
                          <th key={code} className="px-2 py-2 text-center font-medium">
                            {code}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.samples.map((sample, index) => (
                        <tr key={index} className="border-b">
                          <td className="px-3 py-2.5">
                            <span className="font-mono text-xs font-medium">{sample.labId || "—"}</span>
                            <span className="ml-2 text-[11px] text-muted-foreground">
                              {sampleTypeTag(sample.sampleType)}
                            </span>
                          </td>
                          {RECEPTION_TEST_CODES.map((code) => {
                            const checked = sample.tests.includes(code);
                            const blocked = isSampleOnHold(sample.condition);
                            return (
                              <td key={code} className="px-2 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleTest(index, code)}
                                  aria-pressed={checked}
                                  aria-label={`${code} for ${sample.labId || index + 1}`}
className={`inline-flex h-7 w-7 items-center justify-center rounded border transition-colors ${
                                    checked
                                      ? blocked
                                        ? "border-amber-700 bg-amber-700 text-white"
                                        : "border-[#0f6b5c] bg-[#0f6b5c] text-white"
                                      : "border-border bg-background hover:border-[#0f6b5c]"
                                  }`}
                                  >
                                    {checked && <Check className="h-3.5 w-3.5" />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {defsLoaded && (
                    <div className="px-3 pb-3">
                      <CustomFieldsEditor
                        area="tests"
                        fields={draft.testCustomFields ?? []}
                        definitions={fieldDefs}
                        onChange={(next) => patchDraft({ testCustomFields: next })}
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-3 text-[11px] text-muted-foreground">
                    {RECEPTION_TEST_CODES.map((code) => (
                      <span key={code}>
                        <span className="font-semibold text-foreground">{code}</span> {TEST_CODE_LABELS[code]}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Summary rail */}
            <aside className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { value: summary.samples, label: "samples" },
                      { value: summary.tests, label: "tests" },
                      { value: summary.onHold, label: "to hold", highlight: summary.onHold > 0 },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className={`rounded-lg border px-2 py-3 text-center ${
                          stat.highlight ? "border-amber-300 bg-amber-50" : "border-border bg-muted/40"
                        }`}
                      >
                        <p
                          className={`text-2xl font-semibold ${
                            stat.highlight ? "text-amber-800" : "text-foreground"
                          }`}
                        >
                          {stat.value}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Checks</p>
                    {heldSamples.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No samples on hold — all samples passed the intake condition.
                      </p>
                    ) : (
                      heldSamples.map((sample) => (
                        <div
                          key={sample.labId}
                          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs"
                        >
                          <p className="font-semibold text-amber-900">{sample.labId}</p>
                          <p className="text-amber-800">
                            {sample.condition}: moisture may have changed. Hold UU and ask the client to confirm or
                            resample.
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lc-storage">Store in</Label>
                    <Select value={draft.storagePlan} onValueChange={(value) => patchDraft({ storagePlan: value })}>
                      <SelectTrigger id="lc-storage" className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STORAGE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option} className="text-xs">
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Retain until <span className="font-medium">report date + retention period</span>, then dispose
                      unless the client asks for return.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lc-receivedby">Received by</Label>
                    <Input
                      id="lc-receivedby"
                      value={draft.receivedBy}
                      onChange={(e) => patchDraft({ receivedBy: e.target.value })}
                      placeholder="Eng. Anthony Murage"
                      className="text-xs"
                    />
                  </div>

                  {errors.length > 0 && (
                    <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  )}

                  <div className="space-y-2">
                    <Button
                      className="w-full gap-2 bg-[#a85c17] text-white hover:bg-[#8f4e13]"
                      onClick={handleReceive}
                      disabled={isSaving || isPrinting || !loaded}
                    >
                      {isSaving || isPrinting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      {summary.onHold > 0 ? `Receive · ${summary.onHold} on hold · print` : "Receive · print"}
                    </Button>
                    <Button variant="outline" className="w-full" onClick={handleSaveDraft} disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save draft
                    </Button>
                  </div>

                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Receiving prints the acknowledgement and one label per sample, and starts the clock on cube test
                    dates.
                  </p>
                </CardContent>
              </Card>
            </aside>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default LogConsignment;
