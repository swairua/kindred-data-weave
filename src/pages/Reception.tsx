import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import TopNavbar from "@/components/TopNavbar";
import Navigation from "@/components/Navigation";
import { useSession } from "@/context/SessionContext";
import { listReceptionConsignments, processReceptionToProject } from "@/lib/api";
import { toast } from "sonner";
import {
  RECEPTION_STATUS_LABELS,
  consignmentMaterial,
  cubeDueDates,
  getPrimaryTestTypeFromConsignment,
  getTestTypesFromConsignment,
  isSampleOnHold,
  sampleTypeTag,
  type ReceptionConsignmentInput,
} from "@/lib/reception";
import { AlertTriangle, CalendarClock, Plus, Search } from "lucide-react";

type ConsignmentFilter = "open" | "to-log" | "on-hold" | "all";

/** Formats an ISO timestamp as "Today 09:58" / "Fri 16 Oct", like the dashboard. */
const formatReceived = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
};

/** Short weekday label used by the "cubes due for crushing" rail. */
const weekdayLabel = (date: Date): string =>
  date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();

const STATUS_STYLES: Record<ReceptionConsignmentInput["status"], string> = {
  draft: "bg-blue-50 text-blue-700 border-blue-200",
  logged: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "on-hold": "bg-amber-50 text-amber-800 border-amber-200",
  "in-testing": "bg-violet-50 text-violet-700 border-violet-200",
  processed: "bg-slate-50 text-slate-700 border-slate-200",
};

const Reception = () => {
  const navigate = useNavigate();
  const { user, logout } = useSession();

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out");
  };

  const [consignments, setConsignments] = useState<ReceptionConsignmentInput[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConsignmentFilter>("open");
  const [processing, setProcessing] = useState<string | null>(null);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [selectedForProcess, setSelectedForProcess] = useState<ReceptionConsignmentInput | null>(null);
  const [selectedTestType, setSelectedTestType] = useState<string>("");

  const openProcessDialog = (e: React.MouseEvent, consignment: ReceptionConsignmentInput) => {
    e.stopPropagation();
    if (consignment.projectId || (consignment as any).project_id || (consignment as any).processedAt) {
      toast.info("Already processed to project");
      return;
    }
    const recommended = getPrimaryTestTypeFromConsignment(consignment);
    setSelectedForProcess(consignment);
    setSelectedTestType(recommended);
    setProcessDialogOpen(true);
  };

  const confirmProcess = async () => {
    if (!selectedForProcess) return;
    setProcessing(selectedForProcess.rcNo);
    try {
      const res = await processReceptionToProject(selectedForProcess, selectedTestType);
      toast.success(`Created project #${res.projectId} from ${selectedForProcess.rcNo}`);
      const rows = await listReceptionConsignments();
      setConsignments(rows);
      setProcessDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process reception");
    } finally {
      setProcessing(null);
    }
  };

  const handleProcessToProject = async (e: React.MouseEvent, consignment: ReceptionConsignmentInput) => {
    openProcessDialog(e, consignment);
  };

  useEffect(() => {
    let active = true;
    listReceptionConsignments()
      .then((rows) => {
        if (active) setConsignments(rows);
      })
      .catch(() => {
        if (active) setConsignments([]);
      });
    return () => {
      active = false;
    };
  }, []);

  /** Applies the free-text search across the fields shown in the table. */
  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return consignments;
    return consignments.filter((c) => {
      const haystack = [
        c.rcNo,
        c.jobNo,
        c.client,
        c.project,
        c.clientRef,
        ...c.samples.flatMap((s) => [s.labId, s.clientMark, s.location]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [consignments, query]);

  const counts = useMemo(() => {
    const onHold = searched.filter((c) => c.status === "on-hold").length;
    const toLog = searched.filter((c) => c.status === "draft").length;
    const waitingSamples = searched
      .filter((c) => c.status === "draft")
      .reduce((n, c) => n + c.samples.length, 0);
    return { open: searched.length - toLog, toLog, onHold, waitingSamples };
  }, [searched]);

  const receivedConsignments = useMemo(
    () => consignments.filter((c) => c.status !== "draft"),
    [consignments],
  );
  const oldestReceived = useMemo(() => {
    if (receivedConsignments.length === 0) return null;
    return receivedConsignments.reduce((oldest, current) =>
      new Date(current.receivedAt).getTime() < new Date(oldest.receivedAt).getTime() ? current : oldest,
    );
  }, [receivedConsignments]);

  const visible = useMemo(() => {
    if (filter === "all") return searched;
    if (filter === "to-log") return searched.filter((c) => c.status === "draft");
    if (filter === "on-hold") return searched.filter((c) => c.status === "on-hold");
    return searched.filter((c) => c.status !== "draft");
  }, [searched, filter]);

  /** Samples held across every consignment, for the "on hold" rail. */
  const heldSamples = useMemo(
    () =>
      consignments.flatMap((c) =>
        c.samples
          .filter((s) => isSampleOnHold(s.condition))
          .map((s) => ({ consignment: c, sample: s })),
      ),
    [consignments],
  );

  /** Cubes due for crushing, computed from the consignment's cast date. */
  const cubesDue = useMemo(() => {
    const entries: Array<{ date: Date; label: string; days: number; job: string }> = [];
    for (const consignment of consignments) {
      const castDate = consignment.cubeCastDate;
      if (!castDate) continue;
      const due = cubeDueDates(castDate);
      const cubeSamples = consignment.samples.filter(
        (s) => sampleTypeTag(s.sampleType) === "Cube" || s.tests.includes("CMP"),
      );
      if (cubeSamples.length === 0) continue;
      if (due.sevenDay) {
        entries.push({
          date: new Date(due.sevenDay),
          label: `${cubeSamples.length} cubes`,
          days: 7,
          job: consignment.project || consignment.jobNo,
        });
      }
      if (due.twentyEightDay) {
        entries.push({
          date: new Date(due.twentyEightDay),
          label: `${cubeSamples.length} cubes`,
          days: 28,
          job: consignment.project || consignment.jobNo,
        });
      }
    }
    return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [consignments]);

  /**
   * Opens the recording wizard for a sample, carrying the reception Lab ID so
   * the new record starts life linked to the sample the lab just logged.
   */
  const recordSample = (labId: string) => {
    const params = new URLSearchParams({
      material: "concrete",
      test: "compressive",
      labId,
    });
    navigate(`/record?${params.toString()}`);
  };

  return (<>
    <SidebarProvider>
      <TopNavbar currentView="reception" onViewChange={() => {}} />
      <Navigation currentView="reception" onViewChange={() => {}} onLogout={handleLogout} userName={user.name} userEmail={user.email} />
      <SidebarInset>
        <div className="min-h-screen bg-muted/30 pt-16">
          <header className="flex flex-wrap items-center gap-3 px-6 pt-5">
            <SidebarTrigger />
            <div className="mr-auto">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">Sample reception</h1>
              <p className="text-xs text-muted-foreground">Ruiru lab</p>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Scan label or search Lab ID, client, BH…"
                className="w-72 pl-8"
              />
            </div>
            <Button
              onClick={() => navigate("/reception/new")}
              className="gap-1.5 bg-[#0f6b5c] text-white hover:bg-[#0b5449]"
            >
              <Plus className="h-4 w-4" /> Log consignment
            </Button>
          </header>

          {/* Headline counters */}
          <div className="grid gap-4 px-6 pt-5 sm:grid-cols-2 xl:grid-cols-4">
            {[
               {
                 label: "Received today",
                 value: receivedConsignments.reduce((n, c) => n + c.samples.length, 0),
                 hint: `samples in ${receivedConsignments.length} consignments${oldestReceived ? ` · oldest ${new Date(oldestReceived.receivedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : ""}`,
               },
               {
                 label: "Waiting to be logged",
                 value: counts.waitingSamples,
                 hint: "arrived, not yet logged",
              },
              {
                label: "On hold",
                value: heldSamples.length,
                hint: "nonconformance · client query",
                accent: heldSamples.length > 0,
              },
              {
                label: "Cubes due this week",
                value: cubesDue.length,
                hint: `across ${new Set(cubesDue.map((c) => c.job)).size} jobs`,
              },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p
                    className={`mt-1 text-3xl font-semibold ${
                      stat.accent ? "text-amber-700" : "text-foreground"
                    }`}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-5 px-6 py-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            {/* Consignments table */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Consignments</CardTitle>
                <div className="flex rounded-lg border p-0.5 text-xs">
                  {(
                    [
                      ["open", `Open · ${counts.open}`],
                      ["to-log", `To log · ${counts.toLog}`],
                      ["on-hold", `On hold · ${counts.onHold}`],
                      ["all", "All"],
                    ] as Array<[ConsignmentFilter, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={`rounded-md px-3 py-1.5 transition-colors ${
                        filter === key
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {visible.length === 0 ? (
                  <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                    No consignments yet — use “Log consignment” to receive the first one.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead>
                        <tr className="border-y bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-2.5 font-medium">Consignment</th>
                          <th className="px-4 py-2.5 font-medium">Client · project</th>
                          <th className="px-4 py-2.5 font-medium">Material</th>
                          <th className="px-4 py-2.5 font-medium">Samples</th>
                          <th className="px-4 py-2.5 font-medium">Received</th>
                          <th className="px-4 py-2.5 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((consignment) => {
                          const held = consignment.samples.filter((s) => isSampleOnHold(s.condition));
                          return (
                            <tr
                              key={consignment.rcNo}
                              className="cursor-pointer border-b transition-colors hover:bg-muted/40"
                              onClick={() =>
                                navigate(`/reception/${encodeURIComponent(consignment.rcNo)}`)
                              }
                            >
                              <td className="px-4 py-3">
                                <p className="font-mono text-xs font-semibold text-[#0f6b5c]">
                                  {consignment.rcNo}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Job {consignment.jobNo || "—"}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium">{consignment.client || "—"}</p>
                                <p className="text-xs text-muted-foreground">{consignment.project || "—"}</p>
                              </td>
                              <td className="px-4 py-3 text-xs">{consignmentMaterial(consignment)}</td>
                              <td className="px-4 py-3 text-xs">
                                {consignment.samples.length}
                                {consignment.samples.some((s) => sampleTypeTag(s.sampleType) === "Cube") && (
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="ml-2 h-auto p-0 text-xs text-[#0f6b5c]"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      const cube = consignment.samples.find(
                                        (s) => sampleTypeTag(s.sampleType) === "Cube",
                                      );
                                      if (cube) recordSample(cube.labId);
                                    }}
                                  >
                                    Record test
                                  </Button>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-xs">{formatReceived(consignment.receivedAt)}</p>
                                <p className="text-xs text-muted-foreground">{consignment.receivedBy || "—"}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                                    STATUS_STYLES[consignment.status]
                                  }`}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                  {RECEPTION_STATUS_LABELS[consignment.status]}
                                </span>
                                {(consignment.projectId || (consignment as any).project_id) && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Project #{consignment.projectId || (consignment as any).project_id}
                                  </p>
                                )}
                                {held.length > 0 && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {held.length} sample{held.length === 1 ? "" : "s"} held (seal broken)
                                  </p>
                                )}
                                {!consignment.projectId && !(consignment as any).project_id && (consignment.status === "logged" || consignment.status === "on-hold" || consignment.status === "in-testing") && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-2 h-7 text-xs"
                                    disabled={processing === consignment.rcNo}
                                    onClick={(e) => handleProcessToProject(e, consignment)}
                                  >
                                    {processing === consignment.rcNo ? "Processing..." : "Process to project"}
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* On hold rail */}
            <aside className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600" /> On hold — awaiting client
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {heldSamples.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nothing on hold — every received sample passed the intake condition.
                    </p>
                  ) : (
                    heldSamples.map(({ consignment, sample }) => (
                      <div
                        key={`${consignment.rcNo}-${sample.labId}`}
                        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs"
                      >
                        <p className="font-mono font-semibold text-amber-900">
                          {sample.labId}
                          <span className="ml-2 font-normal">
                            · {sample.clientMark} {sample.sampleType}
                          </span>
                        </p>
                        <p className="mt-1 text-amber-800">
                          {sample.condition} on arrival. {sample.tests.join("/") || "No tests"} test is on hold until the
                          client confirms or resamples.
                        </p>
                        <button
                          type="button"
                          className="mt-1.5 font-medium text-amber-900 underline underline-offset-2"
                          onClick={() =>
                            navigate(`/reception/${encodeURIComponent(consignment.rcNo)}`)
                          }
                        >
                          Open consignment
                        </button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Cubes due for crushing */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CalendarClock className="h-4 w-4 text-[#0f6b5c]" /> Cubes due for crushing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Test dates computed from the cast date at logging.
                  </p>
                  {cubesDue.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No cubes scheduled yet — set a cast date when logging the consignment.
                    </p>
                  ) : (
                    cubesDue.map((entry) => (
                      <div key={`${entry.job}-${entry.date.toISOString()}`} className="flex gap-3 border-b pb-2 last:border-0">
                        <div className="w-10 shrink-0">
                          <p className="text-[10px] text-muted-foreground">{weekdayLabel(entry.date)}</p>
                          <p className="text-xl font-semibold leading-tight">{entry.date.getDate()}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">
                            {entry.label} · {entry.job}
                          </p>
                        </div>
                        <span className="h-5 shrink-0 rounded bg-blue-50 px-2 text-[11px] leading-5 text-blue-700">
                          {entry.days} d
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
    <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Process reception to project</DialogTitle>
          <DialogDescription>
            {selectedForProcess ? `Convert ${selectedForProcess.rcNo} (${selectedForProcess.client}) to a project.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">
            <p className="font-medium mb-1">Detected test codes</p>
            <p className="text-muted-foreground">
              {selectedForProcess?.samples?.flatMap(s => s.tests || []).filter((v,i,a) => a.indexOf(v)===i).join(", ") || "None"}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-type">Project type</Label>
            <Select value={selectedTestType} onValueChange={setSelectedTestType}>
              <SelectTrigger id="project-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compressive">Compressive (Concrete)</SelectItem>
                <SelectItem value="atterberg">Atterberg (Soil classification)</SelectItem>
                <SelectItem value="grading">Grading/Particle size</SelectItem>
                <SelectItem value="proctor">Proctor/Compaction</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Recommended based on test codes. You can change this if the classification is incorrect.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setProcessDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmProcess} disabled={processing === selectedForProcess?.rcNo}>
            {processing === selectedForProcess?.rcNo ? "Processing..." : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>);
};

export default Reception;
