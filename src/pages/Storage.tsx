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
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Package, Thermometer, Flame, Trash2, Plus, RefreshCw } from "lucide-react";
import { listRecords } from "@/lib/api";
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

const Storage = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLocations = async () => {
      try {
        setIsLoading(true);
        const response = await listRecords<StorageLocation>("storage_locations", { limit: 100 });
        setLocations(response.data || []);
      } catch (error) {
        console.error("Failed to load storage locations:", error);
        setLocations([]);
        toast.error("Failed to load storage locations");
      } finally {
        setIsLoading(false);
      }
    };

    loadLocations();
  }, []);

  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      const searchMatch =
        searchQuery === "" ||
        loc.location_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loc.location_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (loc.description && loc.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return searchMatch;
    });
  }, [locations, searchQuery]);


  const handleRefresh = async () => {
    try {
      const response = await listRecords<StorageLocation>("storage_locations", { limit: 100 });
      setLocations(response.data || []);
      toast.success("Storage refreshed");
    } catch (error) {
      toast.error("Failed to refresh storage");
    }
  };

  const utilization = (loc: StorageLocation): number => {
    if (!loc.capacity || loc.capacity <= 0) return 0;
    return Math.round((loc.current_count / loc.capacity) * 100);
  };

  const utilizationColor = (pct: number): string => {
    if (pct >= 90) return "text-destructive";
    if (pct >= 75) return "text-amber-600";
    return "text-emerald-600";
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
          <header className="border-b bg-card sticky top-0 z-10">
            <div className="flex items-center justify-between h-11 px-3 sm:px-4 gap-2">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <div>
                  <h1 className="text-sm font-semibold leading-4">Storage</h1>
                  <p className="text-[10px] leading-3 text-muted-foreground">
                    Sample storage locations and capacity
                  </p>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {locations.map((loc) => {
                  const pct = utilization(loc);
                  const Icon = STORAGE_TYPE_ICONS[loc.location_type] || Package;
                  return (
                    <Card key={loc.id} className="border">
                      <CardHeader className="flex flex-row items-center justify-between p-3">
                        <div>
                          <CardTitle className="text-xs font-semibold">{loc.location_name}</CardTitle>
                          <p className="text-[9px] text-muted-foreground leading-tight">
                            {STORAGE_TYPE_LABELS[loc.location_type] || loc.location_type}
                          </p>
                        </div>
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </CardHeader>
                      <CardContent className="p-3">
                        <div className="text-2xl font-bold">{loc.current_count}</div>
                        {loc.capacity ? (
                          <div className="text-xs text-muted-foreground mt-1">
                            {loc.current_count} / {loc.capacity} ({pct}%)
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-1">
                            {loc.current_count} items
                          </div>
                        )}
                        <div className="h-1.5 w-full bg-muted rounded-full mt-2 overflow-hidden">
                          <div
                            className={`h-full ${utilizationColor(pct)}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        {loc.description && (
                          <p className="text-[9px] text-muted-foreground mt-2 leading-tight">
                            {loc.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card>
                <CardHeader className="px-3 py-2.5 sm:px-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold leading-5">Storage locations</CardTitle>
                      <CardDescription className="text-[11px] leading-4">
                        {filteredLocations.length} location{filteredLocations.length !== 1 ? "s" : ""}
                      </CardDescription>
                    </div>
                    <div className="w-full sm:flex-1">
                      <Input
                        placeholder="Search location name or type..."
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
                          <TableHead className="h-8 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground">LOCATION</TableHead>
                          <TableHead className="h-8 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground">TYPE</TableHead>
                          <TableHead className="h-8 px-2 text-center text-[10px] font-semibold tracking-wide text-muted-foreground">CAPACITY</TableHead>
                          <TableHead className="h-8 px-2 text-center text-[10px] font-semibold tracking-wide text-muted-foreground">COUNT</TableHead>
                          <TableHead className="h-8 px-2 text-center text-[10px] font-semibold tracking-wide text-muted-foreground">UTILIZATION</TableHead>
                          <TableHead className="h-8 px-2 text-right text-[10px] font-semibold tracking-wide text-muted-foreground">ACTION</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLocations.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                              No storage locations found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredLocations.map((loc) => {
                            const pct = utilization(loc);
                            return (
                              <TableRow key={loc.id} className="border-b last:border-0 hover:bg-muted/50">
                                <TableCell className="px-2 py-1.5">
                                  <div>
                                    <p className="text-xs font-medium leading-4">{loc.location_name}</p>
                                    <p className="text-[10px] leading-3 text-muted-foreground">
                                      {loc.description || "No description"}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-xs">
                                  <span className="inline-flex min-w-[80px] justify-center rounded-sm bg-muted px-1.5 py-0.5 text-[10px] leading-none capitalize">
                                    {STORAGE_TYPE_LABELS[loc.location_type] || loc.location_type}
                                  </span>
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-center text-xs">
                                  {loc.capacity ?? "—"}
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-center text-xs font-medium">
                                  {loc.current_count}
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-center text-xs">
                                  <span className={`font-medium ${utilizationColor(pct)}`}>
                                    {loc.capacity ? `${pct}%` : "N/A"}
                                  </span>
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2.5 text-[11px]"
                                      onClick={() => navigate(`/storage/${loc.id}`)}
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
  );
};

export default Storage;
