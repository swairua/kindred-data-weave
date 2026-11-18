import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ArrowLeft, Loader2, Save, Wrench, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { readRecord, updateRecord } from "@/lib/api";
import { toast } from "sonner";

interface EquipmentItem {
  id: number;
  equipment_name: string;
  equipment_type: string | null;
  serial_number: string | null;
  calibration_due: string | null;
  status: "active" | "maintenance" | "out_of_service";
  last_calibrated: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  maintenance: "Maintenance",
  out_of_service: "Out of service",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  maintenance: "bg-amber-100 text-amber-800 border-amber-200",
  out_of_service: "bg-destructive/10 text-destructive border-destructive/20",
};

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  active: CheckCircle,
  maintenance: Wrench,
  out_of_service: AlertTriangle,
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

const calibrationState = (due: string | null): "overdue" | "due_soon" | "ok" | "none" => {
  if (!due) return "none";
  const dueDate = new Date(due);
  if (Number.isNaN(dueDate.getTime())) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 30);
  if (dueDate < today) return "overdue";
  if (dueDate <= soon) return "due_soon";
  return "ok";
};

const EquipmentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [equipment, setEquipment] = useState<EquipmentItem | null>(null);
  const [form, setForm] = useState<Omit<EquipmentItem, "id" | "created_at" | "updated_at"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const response = await readRecord<EquipmentItem>("equipment", id);
      const row = response.data;
      if (!row) {
        setEquipment(null);
        return;
      }
      setEquipment(row);
      setForm({
        equipment_name: row.equipment_name ?? "",
        equipment_type: row.equipment_type ?? "",
        serial_number: row.serial_number ?? "",
        calibration_due: row.calibration_due?.slice(0, 10) ?? "",
        status: row.status ?? "active",
        last_calibrated: row.last_calibrated?.slice(0, 10) ?? "",
        notes: row.notes ?? "",
      });
    } catch (error) {
      console.error("Failed to load equipment:", error);
      toast.error("Failed to load equipment");
      setEquipment(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!form || !id) return;
    try {
      setIsSaving(true);
      await updateRecord("equipment", id, {
        equipment_name: form.equipment_name.trim(),
        equipment_type: form.equipment_type?.trim() ? form.equipment_type.trim() : null,
        serial_number: form.serial_number?.trim() ? form.serial_number.trim() : null,
        calibration_due: form.calibration_due || null,
        status: form.status,
        last_calibrated: form.last_calibrated || null,
        notes: form.notes?.trim() ? form.notes.trim() : null,
      });
      toast.success("Equipment saved");
      await load();
    } catch (error) {
      console.error("Failed to save equipment:", error);
      toast.error("Failed to save equipment");
    } finally {
      setIsSaving(false);
    }
  };

  const calState = calibrationState(form?.calibration_due || null);
  const StatusIcon = (form && STATUS_ICONS[form.status]) || Wrench;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="flex items-center justify-between h-11 px-3 sm:px-4 gap-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <div>
              <h1 className="text-sm font-semibold leading-4">Equipment</h1>
              <p className="text-[10px] leading-3 text-muted-foreground">
                {equipment?.equipment_name ?? "Equipment detail"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => navigate("/equipment")}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="p-3 sm:p-4 max-w-3xl">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !equipment || !form ? (
            <Card className="rounded-md border border-border shadow-none">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Equipment not found.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="rounded-md border border-border shadow-none mb-3">
                <CardHeader className="px-3 py-2.5 sm:px-4 flex flex-row items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                      <StatusIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold leading-5">{form.equipment_type || "Equipment"}</CardTitle>
                      <CardDescription className="text-[10px] leading-3">
                        ID {equipment.id} · created {formatDate(equipment.created_at)} · updated {formatDate(equipment.updated_at)}
                      </CardDescription>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[form.status]}`}>
                    {STATUS_LABELS[form.status]}
                  </span>
                </CardHeader>
                <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
                  {calState === "overdue" ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Calibration overdue since {formatDate(form.calibration_due)}</p>
                  ) : calState === "due_soon" ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700"><Clock className="h-3.5 w-3.5" /> Calibration due by {formatDate(form.calibration_due)} (within 30 days)</p>
                  ) : calState === "ok" ? (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle className="h-3.5 w-3.5" /> Calibration OK until {formatDate(form.calibration_due)}</p>
                  ) : (
                    <p className="text-[10px] leading-3 text-muted-foreground">No calibration due date set.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-md border border-border shadow-none">
                <CardHeader className="px-3 py-2.5 sm:px-4">
                  <CardTitle className="text-sm font-semibold leading-5">Details</CardTitle>
                  <CardDescription className="text-[11px] leading-4">Edit and save this equipment record.</CardDescription>
                </CardHeader>
                <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs font-medium" htmlFor="equipment_name">Name</label>
                      <Input
                        id="equipment_name"
                        value={form.equipment_name}
                        onChange={(e) => setForm({ ...form, equipment_name: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium" htmlFor="equipment_type">Type</label>
                      <Input
                        id="equipment_type"
                        value={form.equipment_type ?? ""}
                        onChange={(e) => setForm({ ...form, equipment_type: e.target.value })}
                        className="h-9 text-sm"
                        placeholder="e.g. Compression machine"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium" htmlFor="serial_number">Serial number</label>
                      <Input
                        id="serial_number"
                        value={form.serial_number ?? ""}
                        onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium" htmlFor="last_calibrated">Last calibrated</label>
                      <Input
                        id="last_calibrated"
                        type="date"
                        value={form.last_calibrated ?? ""}
                        onChange={(e) => setForm({ ...form, last_calibrated: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium" htmlFor="calibration_due">Calibration due</label>
                      <Input
                        id="calibration_due"
                        type="date"
                        value={form.calibration_due ?? ""}
                        onChange={(e) => setForm({ ...form, calibration_due: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs font-medium" htmlFor="status">Status</label>
                      <Select value={form.status} onValueChange={(value: EquipmentItem["status"]) => setForm({ ...form, status: value })}>
                        <SelectTrigger id="status" className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                          <SelectItem value="out_of_service">Out of service</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium" htmlFor="notes">Notes</label>
                    <Textarea
                      id="notes"
                      value={form.notes ?? ""}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="text-sm min-h-[80px]"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving || !form.equipment_name.trim()} className="h-9 gap-1.5 px-4 text-xs">
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default EquipmentDetail;
