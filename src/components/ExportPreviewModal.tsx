import React, { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

export interface ExportPreviewData {
  type: "pdf" | "excel";
  fileName: string;
  blob: Blob;
  summary?: {
    title?: string;
    projectName?: string;
    clientName?: string;
    date?: string;
    pageCount?: number;
    rowCount?: number;
    previewData?: Record<string, string | number>[];
  };
}

interface ExportPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ExportPreviewData | null;
  onConfirm?: () => void;
  isLoading?: boolean;
}

export const ExportPreviewModal: React.FC<ExportPreviewModalProps> = ({
  open,
  onOpenChange,
  data,
  onConfirm,
  isLoading = false,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [excelPreview, setExcelPreview] = useState<React.ReactNode>(null);

  useEffect(() => {
    if (data?.blob) {
      if (data.type === "pdf") {
        const url = URL.createObjectURL(data.blob);
        setPdfUrl(url);
        return () => URL.revokeObjectURL(url);
      } else if (data.type === "excel") {
        // For Excel, we show summary data if available
        if (data.summary?.previewData) {
          setExcelPreview(
            <div className="space-y-4">
              {data.summary.previewData.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-2 gap-2 border-b pb-2 last:border-0"
                >
                  {Object.entries(row).map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <span className="font-semibold text-muted-foreground">
                        {key}:
                      </span>
                      <span className="ml-2">{String(value)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        } else {
          setExcelPreview(
            <div className="text-center py-8 text-muted-foreground">
              Excel file prepared and ready to download
            </div>
          );
        }
      }
    }
  }, [data]);

  const handleDownload = () => {
    if (!data?.blob) return;

    const url = URL.createObjectURL(data.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = data.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`${data.fileName} downloaded`);
    onOpenChange(false);

    if (onConfirm) {
      onConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Preview Export
          </DialogTitle>
          <DialogDescription>
            Review your {data?.type === "pdf" ? "PDF" : "Excel"} export before
            downloading
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {data?.type === "pdf" && pdfUrl ? (
            <div className="h-full bg-muted rounded-lg overflow-hidden">
              <iframe
                src={pdfUrl}
                className="w-full h-full"
                title="PDF Preview"
                style={{ border: "none" }}
              />
            </div>
          ) : data?.type === "excel" ? (
            <ScrollArea className="h-full bg-muted rounded-lg p-4">
              {excelPreview}
            </ScrollArea>
          ) : (
            <div className="h-full bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
              Loading preview...
            </div>
          )}
        </div>

        {/* Summary info */}
        {data?.summary && (
          <div className="text-sm bg-muted p-3 rounded-lg space-y-1">
            {data.summary.title && (
              <p>
                <span className="font-semibold">Title:</span> {data.summary.title}
              </p>
            )}
            {data.summary.projectName && (
              <p>
                <span className="font-semibold">Project:</span>{" "}
                {data.summary.projectName}
              </p>
            )}
            {data.summary.clientName && (
              <p>
                <span className="font-semibold">Client:</span>{" "}
                {data.summary.clientName}
              </p>
            )}
            {data.summary.date && (
              <p>
                <span className="font-semibold">Date:</span> {data.summary.date}
              </p>
            )}
            {data.summary.pageCount && (
              <p>
                <span className="font-semibold">Pages:</span>{" "}
                {data.summary.pageCount}
              </p>
            )}
            {data.summary.rowCount && (
              <p>
                <span className="font-semibold">Records:</span>{" "}
                {data.summary.rowCount}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={isLoading}>
            {isLoading ? "Preparing..." : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { ExportPreviewModal };
