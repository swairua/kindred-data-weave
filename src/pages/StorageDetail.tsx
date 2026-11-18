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
import { ArrowLeft, Loader2, Package, Thermometer, Flame, Trash2, Save } from "lucide-react";
import { readRecord, updateRecord } from "@/lib/api";
import { toast } from "sonner";

interface StorageLocation {
  id: number;
  location_name: string;
  location_type: string;
  capacity: number | null;
  current_count: number;
  description: string | null;
  created_at?: string;
  updated_at?: string;
}

const STORAGE_TYPE_ICONS: Record<string, typeof Package> = {
  cold_room: Thermometer,
  curing_tank: Flame,
  bulk_racks: Package,
  disposal: Trash2,
};

const STORAGE_TYPE_LABELS: Record<string, string> = {
  cold_room: "Cold room (U100)",
  curing_tank: "Curing tank",
  bulk_racks: "Bulk racks",
  disposal: "Due for disposal",
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

const StorageDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [location, setLocation] = useState<StorageLocation | null>(null);
  const [form, setForm] = useState<Omit<StorageLocation, "id" | "created_at" | "updated_at"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const response = await readRecord<StorageLocation>("storage_locations", id);
      const row = response.data;
      if (!row) {
        setLocation(null);
        return;
      }
      setLocation(row);
      setForm({
        location_name: row.location_name ?? "",
        location_type: row.location_type ?? "bulk_racks",
        capacity: row.capacity ?? null,
        current_count: row.current_count ?? 0,
        description: row.description ?? "",
      });
    } catch (error) {
      console.error("Failed to load storage location:", error);
      toast.error("Failed to load storage location");
      setLocation(null);
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
      await updateRecord("storage_locations", id, {
        location_name: form.location_name.trim(),
        location_type: form.location_type,
        capacity: form.capacity === null ? null : Number(form.capacity),
        current_count: Number(form.current_count) || 0,
        description: form.description?.trim() ? form.description.trim() : null,
      });
      toast.success("Storage location saved");
      await load();
    } catch (error) {
      console.error("Failed to save storage location:", error);
      toast.error("Failed to save storage location");
    } finally {
      setIsSaving(false);
    }
  };

  const utilization = (loc: { capacity: number | null; current_count: number }): number => {
    if (!loc.capacity || loc.capacity <= 0) return 0;
    return Math.round((loc.current_count / loc.capacity) * 100);
  };

  const typeIconName = form?.location_type;
  const TypeIcon = (typeIconName && STORAGE_TYPE_ICONS[typeIconName]) || Package;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="flex items-center justify-between h-11 px-3 sm:px-4 gap-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <div>
              <h1 className="text-sm font-semibold leading-4">Storage location</h1>
              <p className="text-[10px] leading-3 text-muted-foreground">
                {location?.location_name ?? "Storage detail"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => navigate("/storage")}>
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
          ) : !location || !form ? (
            <Card className="rounded-md border border-border shadow-none">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Storage location not found.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="rounded-md border border-border shadow-none mb-3">
                <CardHeader className="px-3 py-2.5 sm:px-4 flex flex-row items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                      <TypeIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold leading-5">
                        {STORAGE_TYPE_LABELS[form.location_type] || form.location_type}
                      </CardTitle>
                      <CardDescription className="text-[10px] leading-3">
                        ID {location.id} · created {formatDate(location.created_at)} · updated {formatDate(location.updated_at)}
                      </CardDescription>
                    </div>
                  </div>
                  {form.capacity && form.capacity > 0 ? (
                    <span className="text-xs font-medium text-muted-foreground">
                      {utilization(form)}% full
                    </span>
                  ) : null}
                </CardHeader>
                <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
                  {form.capacity && form.capacity > 0 ? (
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, utilization(form))}%` }}
                      />
                    </div>
                  ) : (
                    <p className="text-[10px] leading-3 text-muted-foreground">No capacity limit set for this location.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-md border border-border shadow-none">
                <CardHeader className="px-3 py-2.5 sm:px-4">
                  <CardTitle className="text-sm font-semibold leading-5">Details</CardTitle>
                  <CardDescription className="text-[11px] leading-4">Edit and save this storage location.</CardDescription>
                </CardHeader>
                <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium" htmlFor="location_name">Name</label>
                      <Input
                        id="location_name"
                        value={form.location_name}
                        onChange={(e) => setForm({ ...form, location_name: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium" htmlFor="location_type">Type</label>
                      <Select value={form.location_type} onValueChange={(value) => setForm({ ...form, location_type: value })}>
                        <SelectTrigger id="location_type" className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STORAGE_TYPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium" htmlFor="capacity">Capacity (samples)</label>
                      <Input
                        id="capacity"
                        type="number"
                        min={0}
                        value={form.capacity ?? ""}
                        onChange={(e) => setForm({ ...form, capacity: e.target.value === "" ? null : Number(e.target.value) })}
                        className="h-9 text-sm"
                        placeholder="No limit"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium" htmlFor="current_count">Currently stored</label>
                      <Input
                        id="current_count"
                        type="number"
                        min={0}
                        value={form.current_count}
                        onChange={(e) => setForm({ ...form, current_count: Number(e.target.value) })}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium" htmlFor="description">Description</label>
                    <Textarea
                      id="description"
                      value={form.description ?? ""}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="text-sm min-h-[80px]"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving || !form.location_name.trim()} className="h-9 gap-1.5 px-4 text-xs">
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

export default StorageDetail;
