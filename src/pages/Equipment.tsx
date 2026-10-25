import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Wrench, CheckCircle, AlertTriangle, Clock, Plus, RefreshCw } from "lucide-react";
import Navigation from "@/components/Navigation";
import { listRecords } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
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

const Equipment = () => {
  const navigate = useNavigate();
  const { user, logout } = useSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadEquipment = async () => {
      try {
        setIsLoading(true);
        const response = await listRecords<EquipmentItem>("equipment", { limit: 100 });
        setEquipment(response.data || []);
      } catch (error) {
        console.error("Failed to load equipment:", error);
        setEquipment([]);
        toast.error("Failed to load equipment");
      } finally {
        setIsLoading(false);
      }
    };

    loadEquipment();
  }, []);

  const filteredEquipment = useMemo(() => {
    return equipment.filter((eq) => {
      const searchMatch =
        searchQuery === "" ||
        eq.equipment_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (eq.equipment_type && eq.equipment_type.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (eq.serial_number && eq.serial_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (eq.notes && eq.notes.toLowerCase().includes(searchQuery.toLowerCase()));
      return searchMatch;
    });
  }, [equipment, searchQuery]);

  const isDueSoon = (dueDate: string | null): boolean => {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return due <= thirtyDaysFromNow && due >= new Date();
  };

  const isOverdue = (dueDate: string | null): boolean => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out");
  };

  const handleRefresh = async () => {
    try {
      const response = await listRecords<EquipmentItem>("equipment", { limit: 100 });
      setEquipment(response.data || []);
      toast.success("Equipment refreshed");
    } catch (error) {
      toast.error("Failed to refresh equipment");
    }
  };

  return (
    <SidebarProvider>
      <Navigation
        currentView="reception"
        onViewChange={() => {}}
        onLogout={handleLogout}
        userName={user.name}
        userEmail={user.email}
      />
      <SidebarInset>
        <div className="flex flex-col min-h-screen bg-background">
          <header className="border-b bg-card sticky top-0 z-10">
            <div className="flex items-center justify-between h-11 px-3 sm:px-4 gap-2">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <div>
                  <h1 className="text-sm font-semibold leading-4">Equipment</h1>
                  <p className="text-[10px] leading-3 text-muted-foreground">
                    Lab equipment calibration and maintenance
                  </p>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <Card className="border">
                  <CardHeader className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total equipment</p>
                        <div className="text-2xl font-bold">{equipment.length}</div>
                      </div>
                      <Wrench className="h-6 w-6 text-muted-foreground" />
                    </div>
                  </CardHeader>
                </Card>
                <Card className="border">
                  <CardHeader className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Active</p>
                        <div className="text-2xl font-bold text-emerald-600">
                          {equipment.filter((e) => e.status === "active").length}
                        </div>
                      </div>
                      <CheckCircle className="h-6 w-6 text-emerald-600" />
                    </div>
                  </CardHeader>
                </Card>
                <Card className="border">
                  <CardHeader className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Calibration due</p>
                        <div className="text-2xl font-bold text-amber-600">
                          {equipment.filter((e) => isDueSoon(e.calibration_due)).length}
                        </div>
                      </div>
                      <Clock className="h-6 w-6 text-amber-600" />
                    </div>
                  </CardHeader>
                </Card>
                <Card className="border">
                  <CardHeader className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Overdue</p>
                        <div className="text-2xl font-bold text-destructive">
                          {equipment.filter((e) => isOverdue(e.calibration_due)).length}
                        </div>
                      </div>
                      <AlertTriangle className="h-6 w-6 text-destructive" />
                    </div>
                  </CardHeader>
                </Card>
              </div>

              <Card>
                <CardHeader className="px-3 py-2.5 sm:px-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold leading-5">Equipment register</CardTitle>
                      <CardDescription className="text-[11px] leading-4">
                        {filteredEquipment.length} item{filteredEquipment.length !== 1 ? "s" : ""}
                      </CardDescription>
                    </div>
                    <div className="w-full sm:flex-1">
                      <Input
                        placeholder="Search equipment name, type, or serial..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <Button onClick={handleRefresh} className="h-8 gap-1.5 px-3 text-xs sm:w-auto">
                      <RefreshCw className="h-3.5 w-3.5" /> Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="h-8 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground">EQUIPMENT</TableHead>
                          <TableHead className="h-8 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground">TYPE</TableHead>
                          <TableHead className="h-8 px-2 text-center text-[10px] font-semibold tracking-wide text-muted-foreground">SERIAL</TableHead>
                          <TableHead className="h-8 px-2 text-center text-[10px] font-semibold tracking-wide text-muted-foreground">STATUS</TableHead>
                          <TableHead className="h-8 px-2 text-center text-[10px] font-semibold tracking-wide text-muted-foreground">CALIBRATION DUE</TableHead>
                          <TableHead className="h-8 px-2 text-right text-[10px] font-semibold tracking-wide text-muted-foreground">ACTION</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEquipment.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                              No equipment found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredEquipment.map((eq) => {
                            const overdue = isOverdue(eq.calibration_due);
                            const dueSoon = isDueSoon(eq.calibration_due);
                            return (
                              <TableRow key={eq.id} className="border-b last:border-0 hover:bg-muted/50">
                                <TableCell className="px-2 py-1.5">
                                  <div>
                                    <p className="text-xs font-medium leading-4">{eq.equipment_name}</p>
                                    {eq.notes && (
                                      <p className="text-[10px] leading-3 text-muted-foreground line-clamp-1">
                                        {eq.notes}
                                      </p>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-xs">
                                  {eq.equipment_type || "—"}
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-center text-xs">
                                  {eq.serial_number || "—"}
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-center text-xs">
                                  <span className={`inline-flex min-w-[70px] justify-center rounded-sm border px-1.5 py-0.5 text-[10px] leading-none ${STATUS_COLORS[eq.status]}`}>
                                    {STATUS_LABELS[eq.status]}
                                  </span>
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-center text-xs">
                                  {eq.calibration_due ? (
                                    <span
                                      className={`font-medium ${overdue ? "text-destructive" : dueSoon ? "text-amber-600" : "text-muted-foreground"}`}
                                    >
                                      {new Date(eq.calibration_due).toLocaleDateString()}
                                      {overdue ? " (overdue)" : dueSoon ? " (due soon)" : ""}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2.5 text-[11px]"
                                      onClick={() => navigate(`/equipment/${eq.id}`)}
                                    >
                                      Open →
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Equipment;
