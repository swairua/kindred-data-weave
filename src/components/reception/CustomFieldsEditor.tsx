"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { ReceptionFieldArea, ReceptionFieldDefinition } from "@/lib/reception";

type FieldValue = { key: string; value: string };

interface CustomFieldsEditorProps {
  /** Area these fields belong to. */
  area: ReceptionFieldArea;
  /** Current values (editable). */
  fields: FieldValue[];
  /** Server-defined field definitions for this area. */
  definitions: ReceptionFieldDefinition[];
  /** Callback when values change. */
  onChange: (next: FieldValue[]) => void;
}

export const CustomFieldsEditor = ({
  area,
  fields,
  definitions,
  onChange,
}: CustomFieldsEditorProps) => {
  const [adHocKey, setAdHocKey] = useState("");

  const activeDefinitions = useMemo(
    () => definitions.filter((d) => d.area === area && d.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [area, definitions]
  );

  const addAdHocField = useCallback(() => {
    const key = adHocKey.trim();
    if (!key) return;
    onChange([...fields, { key, value: "" }]);
    setAdHocKey("");
  }, [adHocKey, fields, onChange]);

  const updateField = useCallback(
    (index: number, next: FieldValue) => {
      const nextFields = [...fields];
      nextFields[index] = next;
      onChange(nextFields);
    },
    [fields, onChange]
  );

  const removeField = useCallback(
    (index: number) => {
      onChange(fields.filter((_, i) => i !== index));
    },
    [fields, onChange]
  );

  if (activeDefinitions.length === 0 && fields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {activeDefinitions.map((def) => {
        const existing = fields.find((f) => f.key === def.fieldKey);
        const value = existing?.value ?? "";
        return (
          <div
            key={def.fieldKey}
            className="flex items-center gap-2 text-xs"
          >
            <Label className="w-[140px] shrink-0">{def.label}</Label>
            {def.valueType === "select" ? (
              <Select
                value={value || undefined}
                onValueChange={(val) => {
                  const idx = fields.findIndex((f) => f.key === def.fieldKey);
                  if (idx >= 0) {
                    updateField(idx, { ...fields[idx], value: val ?? "" });
                  } else {
                    onChange([...fields, { key: def.fieldKey, value: val ?? "" }]);
                  }
                }}
              >
                <SelectTrigger className="h-8 w-40 text-xs shrink-0">
                  <SelectValue placeholder={def.label} />
                </SelectTrigger>
                <SelectContent>
                  {(def.options ?? []).map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-xs">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={value}
                onChange={(e) => {
                  const idx = fields.findIndex((f) => f.key === def.fieldKey);
                  if (idx >= 0) {
                    updateField(idx, { ...fields[idx], value: e.target.value });
                  } else {
                    onChange([...fields, { key: def.fieldKey, value: e.target.value }]);
                  }
                }}
                placeholder={def.label}
                className="h-7 w-40 text-xs shrink-0"
              />
            )}
            {def.isRequired && <span className="text-amber-600" title="Required">*</span>}
          </div>
        );
      })}

      {/* Ad-hoc (user-defined) fields */}

      {fields.length > 0 && (
        <div className="border-t pt-2 space-y-1">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider">
            <Plus className="h-3 w-3" /> Additional fields
          </div>
          {fields.map((field, index) => {
            const isDefinition = activeDefinitions.some((d) => d.fieldKey === field.key);
            if (isDefinition) return null;
            return (
              <div key={index} className="flex items-center gap-1">
                <Input
                  value={field.key}
                  onChange={(e) => updateField(index, { ...field, key: e.target.value })}
                  placeholder="Field name"
                  className="h-6 w-24 text-[10px]"
                />
                <Input
                  value={field.value}
                  onChange={(e) => updateField(index, { ...field, value: e.target.value })}
                  placeholder="Value"
                  className="h-6 w-24 text-[10px]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 p-0"
                  onClick={() => removeField(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
          <div className="flex items-center gap-1">
            <Input
              value={adHocKey}
              onChange={(e) => setAdHocKey(e.target.value)}
              placeholder="New field name"
              className="h-6 w-28 text-[10px]"
            />
            <Button type="button" variant="outline" size="sm" onClick={addAdHocField}>
              <Plus className="mr-1 h-3 w-3" /> Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
