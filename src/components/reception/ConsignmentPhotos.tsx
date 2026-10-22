"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Camera, Plus, Trash2 } from "lucide-react";
import type { ReceptionPhoto } from "@/lib/reception";
import { listReceptionPhotos, uploadReceptionPhoto, deleteReceptionPhoto } from "@/lib/api";

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
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !rcNo) return;
      setUploading(true);
      const next = [...photos];
      for (const file of Array.from(files)) {
        const photo = await uploadReceptionPhoto(file, rcNo);
        if (photo) {
          next.push(photo);
        } else {
          toast.error(Failed to upload );
        }
      }
      onChange(next);
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    },
    [rcNo, photos, onChange]
  );

  const handleRemove = useCallback(
    async (id: number) => {
      setDeleting((prev) => new Set([...prev, id]));
      try {
        await deleteReceptionPhoto(id);
        onChange(photos.filter((p) => p.id !== id));
      } catch {
        toast.error("Failed to delete photo");
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
    listReceptionPhotos(rcNo).then((loaded) => {
      if (active) onChangeRef.current(loaded);
    });
    return () => {
      active = false;
    };
  }, [rcNo]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none">
          <Plus className="h-4 w-4" />
          <span className="text-xs">
            {uploading ? "Uploading…" : "Add photos"}
          </span>
          <Input
            type="file"
            accept="image/*"
            multiple
            ref={fileInput}
            disabled={disabled}
            className="sr-only"
            onChange={(e) => handleAdd(e.target.files)}
          />
        </label>
        {photos.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {photos.length} attached
          </span>
        )}
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
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
