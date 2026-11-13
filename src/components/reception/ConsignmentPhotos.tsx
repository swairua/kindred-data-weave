"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Camera, Plus, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import type { ReceptionPhoto } from "@/lib/reception";
import { listReceptionPhotos, uploadReceptionPhotoWithProgress, deleteReceptionPhoto } from "@/lib/api";
import { subscribeReceptionLoad } from "@/lib/receptionEvents";
import { resizeImageForUpload } from "@/lib/resizeImage";

interface ConsignmentPhotosProps {
  /** Consignment number photos belong to. */
  rcNo: string;
  /** Current photos (editable). */
  photos: ReceptionPhoto[];
  /** Callback when the photo list changes. */
  onChange: (next: ReceptionPhoto[]) => void;
  /** Whether uploads are disabled (e.g. no rcNo yet). */
  disabled?: boolean;
}

export const ConsignmentPhotos = ({
  rcNo,
  photos,
  onChange,
  disabled = false,
}: ConsignmentPhotosProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Array<{ name: string; fraction: number }>>([]);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !rcNo) return;
      setUploading(true);
      const next = [...photos];
      setUploadProgress(Array.from(files).map((file) => ({ name: file.name, fraction: 0 })));
      for (const file of Array.from(files)) {
        try {
          const prepared = await resizeImageForUpload(file);
          const photo = await uploadReceptionPhotoWithProgress(prepared, rcNo, (fraction) => {
            setUploadProgress((current) => current.map((entry) => (entry.name === file.name ? { ...entry, fraction } : entry)));
          });
          next.push(photo);
        } catch (error) {
          toast.error(`${file.name}: ${error instanceof Error ? error.message : "Failed to upload photo"}`);
        }
      }
      onChange(next);
      setUploading(false);
      setUploadProgress([]);
      if (fileInput.current) fileInput.current.value = "";
    },
    [rcNo, photos, onChange]
  );

  const handleRemove = useCallback(
    async (id: number) => {
      setDeleting((prev) => new Set([...prev, id]));
      try {
        const deleted = await deleteReceptionPhoto(id);
        if (deleted) {
          onChange(photos.filter((p) => p.id !== id));
        } else {
          toast.error("Failed to delete photo");
        }
      } finally {
        setDeleting((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [photos, onChange]
  );

  // Keep the latest onChange in a ref so the photo-loading effect below can
  // depend on rcNo alone. Depending on onChange directly would re-run the
  // effect on every render (the parent passes a new inline callback), and the
  // effect calls onChange -> state update -> re-render -> infinite loop.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Load existing photos when rcNo changes
  useEffect(() => {
    if (!rcNo) return;
    let active = true;
    listReceptionPhotos(rcNo)
      .then((loaded) => {
        if (active) onChangeRef.current(loaded);
      })
      .catch((error) => {
        console.error('[ConsignmentPhotos] Couldn\'t load photos:', error instanceof Error ? error.message : error);
        if (active) setPhotosError(error instanceof Error ? error.message : 'Couldn\'t load photos. Check your connection and try again.');
      });
    return () => {
      active = false;
    };
  }, [rcNo]);

  useEffect(() => subscribeReceptionLoad((event) => {
    if (event.kind === 'photos') setPhotosError(event.message);
  }), []);

  return (
    <div className="space-y-2">
      {photosError && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <span className="font-medium">Couldn't load photos from server.</span>
            <span className="ml-1">{photosError}</span>
          </div>
          <button type="button" className="rounded-md border border-amber-300/60 bg-white/60 px-2 py-1 text-[11px] font-medium hover:bg-white" onClick={() => setPhotosError(null)}>Dismiss</button>
        </div>
      )}

      {uploadProgress.length > 0 && (
        <ul className="space-y-1">
          {uploadProgress.map((entry) => {
            const percent = Math.round(entry.fraction * 100);
            return (
              <li key={entry.name} className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1 text-[11px]">
                {percent < 100
                  ? <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />
                  : <span className="h-3 w-3 inline-block rounded-full bg-emerald-500" aria-hidden="true" />}
                <span className="flex-1 truncate">{entry.name}</span>
                <span className="tabular-nums text-muted-foreground">{percent < 100 ? `${percent}%` : "Done"}</span>
                <div className="h-1.5 w-20 overflow-hidden rounded bg-muted" aria-hidden="true">
                  <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 w-full sm:w-auto"
          onClick={() => fileInput.current?.click()}
          disabled={disabled || uploading}
        >
          <Plus className="h-4 w-4" />
          {uploading ? "Uploading…" : "Add consignment photos"}
        </Button>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input
            type="file"
            accept="image/*"
            multiple
            ref={fileInput}
            disabled={disabled || uploading}
            className="hidden"
            onChange={(e) => handleAdd(e.target.files)}
            aria-label="Select consignment photos"
          />
          {photos.length > 0 && (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {photos.length} attached
            </span>
          )}
        </div>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded border overflow-hidden"
            >
              <img
                src={photo.filePath}
                alt={photo.originalFilename ?? "photo"}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
              {deleting.has(photo.id) ? (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-xs text-white">Removing…</span>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 p-0 bg-black/60 text-white hover:bg-black/80"
                  onClick={() => handleRemove(photo.id)}
                  disabled={disabled}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
