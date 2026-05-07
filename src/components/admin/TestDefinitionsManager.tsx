import { useEffect, useState, useCallback } from "react";
import { listRecords, updateRecord } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TestDefinition {
  id: number;
  test_key: string;
  name: string;
  category: "soil" | "concrete" | "rock" | "special";
  sort_order: number;
  enabled: boolean | number;
  created_at?: string;
  updated_at?: string;
}

interface EditingTest extends Omit<TestDefinition, "enabled"> {
  enabled: boolean;
}

const categories: Array<"soil" | "concrete" | "rock" | "special"> = ["soil", "concrete", "rock", "special"];

export const TestDefinitionsManager = () => {
  const [tests, setTests] = useState<TestDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTest, setEditingTest] = useState<EditingTest | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const loadTestDefinitions = useCallback(async () => {
    setLoading(true);
    try {
      const timestamp = new Date().toISOString();
      console.log(`[TestDefs] ${timestamp} Attempting to load test definitions...`);
      console.log("[TestDefs] Checking network connectivity first...");

      const response = await listRecords<TestDefinition>("test_definitions", { limit: 1000 });
      if (response?.data && Array.isArray(response.data)) {
        console.log(`[TestDefs] ${timestamp} ✓ Successfully loaded ${response.data.length} test definitions`);
        setTests(response.data);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const timestamp = new Date().toISOString();

      console.error(`[TestDefs] ${timestamp} Failed to load test definitions:`, errorMsg);
      console.error("[TestDefs] Error details:", error);

      // Provide helpful error message based on the type of error
      if (errorMsg.includes("Unable to reach API server") || errorMsg.includes("Failed to fetch")) {
        console.error("[TestDefs] Troubleshooting: API Server Connectivity");
        console.error("[TestDefs] 1. Check if lab.wayrus.co.ke is reachable");
        console.error("[TestDefs] 2. Verify your internet connection");
        console.error("[TestDefs] 3. Check browser developer tools (F12) > Network tab for failed requests");
        console.error("[TestDefs] 4. Check if VITE_API_BASE_URL environment variable is set correctly");
        toast.error("Cannot connect to API server. Check your internet connection and try again.");
      } else if (errorMsg.includes("401") || errorMsg.includes("Unauthorized")) {
        console.error("[TestDefs] Authentication failed - please log in again");
        toast.error("Session expired. Please log in again.");
      } else {
        toast.error(`Failed to load test definitions: ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTestDefinitions();
  }, [loadTestDefinitions]);

  const handleEdit = (test: TestDefinition) => {
    setEditingTest({
      ...test,
      enabled: test.enabled !== false && test.enabled !== 0,
    });
    setEditingId(test.id);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!editingTest) return;

    // Validation
    if (!editingTest.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (editingTest.sort_order < 0) {
      toast.error("Sort order must be 0 or greater");
      return;
    }

    setSaving(true);
    try {
      await updateRecord("test_definitions", editingTest.id.toString(), {
        name: editingTest.name,
        category: editingTest.category,
        sort_order: editingTest.sort_order,
        enabled: editingTest.enabled ? 1 : 0,
      });

      toast.success(`Test "${editingTest.name}" updated successfully`);
      setShowDialog(false);
      setEditingTest(null);
      setEditingId(null);
      await loadTestDefinitions();
    } catch (error) {
      console.error("Failed to save test definition:", error);
      toast.error("Failed to save test definition");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setShowDialog(false);
    setEditingTest(null);
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Test Definitions</CardTitle>
            <CardDescription>Manage test metadata, ordering, and visibility</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadTestDefinitions}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No test definitions found</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                {tests.map((test) => (
                  <div
                    key={test.id}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium">{test.name}</h4>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                            {test.test_key}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                            {test.category.charAt(0).toUpperCase() + test.category.slice(1)}
                          </span>
                          {test.enabled === false || test.enabled === 0 ? (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                              Disabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                              Enabled
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Sort Order: {test.sort_order} {test.updated_at && `• Updated: ${new Date(test.updated_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(test)}
                      className="gap-2"
                    >
                      Edit
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Test Definition</DialogTitle>
            <DialogDescription>Update test metadata and visibility settings</DialogDescription>
          </DialogHeader>

          {editingTest && (
            <div className="space-y-4">
              {/* Test Key (read-only) */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Test Key (Read-only)</Label>
                <Input
                  value={editingTest.test_key}
                  disabled
                  className="calculated-field"
                />
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs text-muted-foreground">Name *</Label>
                <Input
                  id="name"
                  value={editingTest.name}
                  onChange={(e) =>
                    setEditingTest({ ...editingTest, name: e.target.value })
                  }
                  placeholder="Enter test name"
                  maxLength={255}
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="category" className="text-xs text-muted-foreground">Category</Label>
                <Select
                  value={editingTest.category}
                  onValueChange={(value) =>
                    setEditingTest({
                      ...editingTest,
                      category: value as "soil" | "concrete" | "rock" | "special",
                    })
                  }
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sort Order */}
              <div className="space-y-2">
                <Label htmlFor="sort_order" className="text-xs text-muted-foreground">Sort Order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={editingTest.sort_order}
                  onChange={(e) =>
                    setEditingTest({
                      ...editingTest,
                      sort_order: Math.max(0, parseInt(e.target.value) || 0),
                    })
                  }
                  min="0"
                />
              </div>

              {/* Enabled Toggle */}
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Checkbox
                  id="enabled"
                  checked={editingTest.enabled}
                  onCheckedChange={(checked) =>
                    setEditingTest({ ...editingTest, enabled: checked as boolean })
                  }
                />
                <Label htmlFor="enabled" className="cursor-pointer flex-1 text-sm">
                  <span className="font-medium">Enable Test</span>
                  <p className="text-xs text-muted-foreground">Show this test in the test list</p>
                </Label>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  variant="default"
                  className="flex-1 gap-2"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  <X className="h-4 w-4" /> Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
