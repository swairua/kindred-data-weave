import { useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, Loader2, X, Copy, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { buildApiUrl, listRecords, uploadFile } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TestDefinitionsManager } from "@/components/admin/TestDefinitionsManager";

type ImageType = "logo" | "contacts" | "stamp";

interface UploadedFile {
  name: string;
  size: number;
  uploadedAt: string;
  type: ImageType;
}

interface StoredImage {
  type: ImageType;
  filePath?: string;
  loading: boolean;
  error?: string;
}

interface DebugInfo {
  projects: any[];
  localStorage: Record<string, any>;
  sessionToken: string | null;
  apiUrl: string;
  timestamp: string;
  error?: string;
}

const Admin = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedImageType, setSelectedImageType] = useState<ImageType>("logo");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [storedImages, setStoredImages] = useState<Record<ImageType, StoredImage>>({
    logo: { type: "logo", loading: false },
    contacts: { type: "contacts", loading: false },
    stamp: { type: "stamp", loading: false },
  });
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const loadDebugInfo = useCallback(async () => {
    setDebugLoading(true);
    try {
      const projects = await listRecords("projects", { limit: 100 });

      const localStorageData: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          try {
            localStorageData[key] = JSON.parse(value || "");
          } catch {
            localStorageData[key] = value;
          }
        }
      }

      const sessionToken = localStorage.getItem("lab_session_token");

      setDebugInfo({
        projects: projects.data || [],
        localStorage: localStorageData,
        sessionToken,
        apiUrl: buildApiUrl(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setDebugInfo({
        projects: [],
        localStorage: {},
        sessionToken: null,
        apiUrl: buildApiUrl(),
        timestamp: new Date().toISOString(),
        error: errorMsg,
      });
    } finally {
      setDebugLoading(false);
    }
  }, []);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  useEffect(() => {
    const fetchStoredImages = async () => {
      try {
        const response = await listRecords<{ image_type: string; file_path: string }>("admin_images");
        const rows: Array<{ image_type: string; file_path: string }> = response.data || [];

        // Get latest per type
        const latest: Record<string, string> = {};
        for (const row of rows) {
          if (!latest[row.image_type]) {
            latest[row.image_type] = row.file_path;
          }
        }

        // Construct full URLs for images
        const apiUrl = new URL(buildApiUrl());
        const baseOrigin = apiUrl.origin;

        const getImageUrl = (path: string): string => {
          const imageUrl = new URL(path, baseOrigin);
          return imageUrl.toString();
        };

        setStoredImages({
          logo: {
            type: "logo",
            filePath: latest.logo ? getImageUrl(latest.logo) : undefined,
            loading: false
          },
          contacts: {
            type: "contacts",
            filePath: latest.contacts ? getImageUrl(latest.contacts) : undefined,
            loading: false
          },
          stamp: {
            type: "stamp",
            filePath: latest.stamp ? getImageUrl(latest.stamp) : undefined,
            loading: false
          },
        });
      } catch (error) {
        console.error("Error loading stored images:", error);
        // Set as no error - just no images available
        setStoredImages({
          logo: { type: "logo", loading: false },
          contacts: { type: "contacts", loading: false },
          stamp: { type: "stamp", loading: false },
        });
      }
    };

    fetchStoredImages();
  }, []);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File size must be less than 50MB");
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      setUploadProgress(30);

      const data = await uploadFile(file, { image_type: selectedImageType });

      setUploadProgress(90);

      setUploadedFiles((prev) => [
        {
          name: file.name,
          size: file.size,
          uploadedAt: new Date().toLocaleString(),
          type: selectedImageType,
        },
        ...prev,
      ]);

      const typeLabel = selectedImageType.charAt(0).toUpperCase() + selectedImageType.slice(1);
      toast.success(`Uploaded ${typeLabel}: ${file.name}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Upload error: ${errorMsg}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [selectedImageType]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUpload(e.target.files);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const handleClearCache = () => {
    try {
      // Clear all localStorage keys related to cached data
      localStorage.removeItem("atterbergProjectState");
      localStorage.removeItem("enhancedAtterbergTests");
      localStorage.removeItem("lab_session_token");

      toast.success("Cache cleared successfully. Please refresh the page to reload data.");
    } catch (error) {
      toast.error("Error clearing cache");
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="images" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="images">Media Library</TabsTrigger>
        <TabsTrigger value="tests">Test Definitions</TabsTrigger>
        <TabsTrigger value="cache">Cache</TabsTrigger>
        <TabsTrigger value="debug">Debug</TabsTrigger>
      </TabsList>

      <TabsContent value="images" className="space-y-6">
        {/* Images Preview Section */}
        <Card>
        <CardHeader>
          <CardTitle>Stored Images Preview</CardTitle>
          <CardDescription>Currently stored lab images (Logo, Contacts, Stamp)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Logo */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Logo</h4>
              <div className="border rounded-lg overflow-hidden bg-muted min-h-[150px] flex items-center justify-center">
                {storedImages.logo.loading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : storedImages.logo.filePath ? (
                  <img src={storedImages.logo.filePath} alt="Logo" className="h-full w-full object-contain p-2" />
                ) : (
                  <p className="text-xs text-muted-foreground">No logo uploaded</p>
                )}
              </div>
            </div>

            {/* Contacts */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Contacts</h4>
              <div className="border rounded-lg overflow-hidden bg-muted min-h-[150px] flex items-center justify-center">
                {storedImages.contacts.loading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : storedImages.contacts.filePath ? (
                  <img src={storedImages.contacts.filePath} alt="Contacts" className="h-full w-full object-contain p-2" />
                ) : (
                  <p className="text-xs text-muted-foreground">No contacts uploaded</p>
                )}
              </div>
            </div>

            {/* Stamp */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Stamp</h4>
              <div className="border rounded-lg overflow-hidden bg-muted min-h-[150px] flex items-center justify-center">
                {storedImages.stamp.loading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : storedImages.stamp.filePath ? (
                  <img src={storedImages.stamp.filePath} alt="Stamp" className="h-full w-full object-contain p-2" />
                ) : (
                  <p className="text-xs text-muted-foreground">No stamp uploaded</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Image Upload</CardTitle>
          <CardDescription>Upload images to the lab media library</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Image Type</label>
            <Select value={selectedImageType} onValueChange={(value) => setSelectedImageType(value as ImageType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="logo">Logo</SelectItem>
                <SelectItem value="contacts">Contacts</SelectItem>
                <SelectItem value="stamp">Stamp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-lg p-8 transition-all ${
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              disabled={isUploading}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Upload image"
            />

            <div className="flex flex-col items-center gap-3 text-center">
              {isUploading ? (
                <>
                  <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
                  <div className="space-y-2 w-full max-w-sm">
                    <p className="text-sm font-medium text-foreground">Uploading...</p>
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground">{Math.round(uploadProgress)}%</p>
                  </div>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Drag and drop images here</p>
                    <p className="text-xs text-muted-foreground">or click to browse</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Supported formats: JPG, PNG, GIF, WebP (Max 50MB)</p>
                </>
              )}
            </div>
          </div>

          {!isUploading && (
            <div className="mt-4">
              <Button variant="outline" className="w-full" asChild>
                <label className="cursor-pointer">
                  Choose Image
                  <input type="file" accept="image/*" onChange={handleFileInputChange} className="hidden" />
                </label>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Uploads</CardTitle>
            <CardDescription>{uploadedFiles.length} file(s) uploaded in this session</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-muted">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                      <span className="inline-flex items-center rounded-full bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
                        {file.type.charAt(0).toUpperCase() + file.type.slice(1)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)} • {file.uploadedAt}
                    </p>
                  </div>
                  <div className="text-xs font-medium text-primary">✓ Uploaded</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </TabsContent>

      <TabsContent value="tests" className="space-y-6">
        <TestDefinitionsManager />
      </TabsContent>

      <TabsContent value="cache" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Cache Management</CardTitle>
            <CardDescription>Clear cached data to resolve sync issues between frontend and backend</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              <p className="text-sm text-foreground">
                <strong>About Cache:</strong> Your browser caches data locally to improve performance. If the frontend shows data that doesn't exist on the backend, clearing the cache will force the application to reload all data from the server.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Cached Data:</h4>
              <ul className="text-sm text-muted-foreground space-y-2 ml-4">
                <li>• Session token</li>
                <li>• Atterberg test project data</li>
                <li>• Application state and preferences</li>
              </ul>
            </div>

            <Button
              onClick={handleClearCache}
              variant="destructive"
              className="w-full"
            >
              Clear All Cache
            </Button>

            <p className="text-xs text-muted-foreground">
              You will be logged out and may need to refresh the page after clearing the cache.
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="debug" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Debug Information</CardTitle>
            <CardDescription>View backend data, API responses, and browser storage state</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={loadDebugInfo}
              disabled={debugLoading}
              className="w-full"
            >
              {debugLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading Debug Info...
                </>
              ) : (
                "Load Debug Info"
              )}
            </Button>

            {debugInfo && (
              <div className="space-y-4">
                {/* Error Display */}
                {debugInfo.error && (
                  <div className="p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
                    <p className="text-sm text-red-900 dark:text-red-200">
                      <strong>Error:</strong> {debugInfo.error}
                    </p>
                  </div>
                )}

                {/* API URL */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">API URL</label>
                    <button
                      onClick={() => copyToClipboard(debugInfo.apiUrl, "apiUrl")}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {copiedField === "apiUrl" ? (
                        <>
                          <Check className="h-3 w-3" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-2 rounded bg-muted font-mono text-xs break-all">
                    {debugInfo.apiUrl}
                  </div>
                </div>

                {/* Session Token */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Session Token</label>
                    <button
                      onClick={() => copyToClipboard(debugInfo.sessionToken || "None", "token")}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {copiedField === "token" ? (
                        <>
                          <Check className="h-3 w-3" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-2 rounded bg-muted font-mono text-xs break-all">
                    {debugInfo.sessionToken ? `${debugInfo.sessionToken.substring(0, 20)}...` : "Not set"}
                  </div>
                </div>

                {/* Projects from API */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">
                      Projects from API ({debugInfo.projects.length} found)
                    </label>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(debugInfo.projects, null, 2), "projects")}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {copiedField === "projects" ? (
                        <>
                          <Check className="h-3 w-3" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  {debugInfo.projects.length === 0 ? (
                    <div className="p-2 rounded bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                      <p className="text-xs text-yellow-900 dark:text-yellow-200">
                        No projects found in database. This matches your backend state.
                      </p>
                    </div>
                  ) : (
                    <div className="p-2 rounded bg-muted font-mono text-xs max-h-48 overflow-auto">
                      <pre>{JSON.stringify(debugInfo.projects, null, 2)}</pre>
                    </div>
                  )}
                </div>

                {/* LocalStorage Contents */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Browser Storage (localStorage)</label>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(debugInfo.localStorage, null, 2), "localStorage")}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {copiedField === "localStorage" ? (
                        <>
                          <Check className="h-3 w-3" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-2 rounded bg-muted font-mono text-xs max-h-48 overflow-auto">
                    <pre>{JSON.stringify(debugInfo.localStorage, null, 2) || "{}"}</pre>
                  </div>
                </div>

                {/* Timestamp */}
                <div className="text-xs text-muted-foreground text-right">
                  Last loaded: {new Date(debugInfo.timestamp).toLocaleString()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Diagnostic Checks</CardTitle>
            <CardDescription>Quick status checks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded border">
              <span className="text-sm">Session Token Set</span>
              <span className={`text-xs px-2 py-1 rounded ${debugInfo?.sessionToken ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"}`}>
                {debugInfo?.sessionToken ? "✓ Yes" : "✗ No"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded border">
              <span className="text-sm">Projects in Database</span>
              <span className={`text-xs px-2 py-1 rounded ${debugInfo && debugInfo.projects.length > 0 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"}`}>
                {debugInfo ? `${debugInfo.projects.length} found` : "Not checked"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded border">
              <span className="text-sm">Cached Project Data in Browser</span>
              <span className={`text-xs px-2 py-1 rounded ${debugInfo?.localStorage["atterbergProjectState"] ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"}`}>
                {debugInfo?.localStorage["atterbergProjectState"] ? "⚠ Cached" : "✓ Not cached"}
              </span>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
    </div>
  );
};

export default Admin;
