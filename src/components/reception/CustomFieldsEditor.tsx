"use client";

import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { ReceptionFieldArea, ReceptionFieldDefinition } from "@/lib/reception";

type FieldValue = { key: string; value: string };

interface CustomFieldsEditorProps {
  area: ReceptionFieldArea;
  fields: FieldValue[];
  definitions: ReceptionFieldDefinition[];
  onChange: (next: FieldValue[]) => void;
}

export const CustomFieldsEditor = ({
  area,
  fields,
  definitions,
  onChange,
}: CustomFieldsEditorProps) => {
  const AREA_LABELS: Record<ReceptionFieldArea, string> = {
    consignment: "Consignment",
    transport: "Transport",
    sample: "Sample",
    tests: "Test request",
  };

  const activeDefinitions = useMemo(
    () => definitions.filter((d) => d.area === area && d.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [area, definitions]
  );

  const addAdHocField = useCallback(() => {
    onChange([...fields, { key: "", value: "" }]);
  }, [fields, onChange]);

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

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span className="text-xs font-medium">{AREA_LABELS[area]} custom inputs</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          aria-label={`Add ${AREA_LABELS[area].toLowerCase()} custom input`}
          onClick={addAdHocField}
        >
          <Plus className="mr-1 h-3 w-3" /> Add custom input
        </Button>
      </div>

      {fields.some((field) => !activeDefinitions.some((definition) => definition.fieldKey === field.key)) && (
        <div className="border-t pt-2 space-y-1">
          {fields.map((field, index) => {
            const isDefinition = activeDefinitions.some((d) => d.fieldKey === field.key);
            if (isDefinition) return null;
            return (
              <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <Input
                  value={field.key}
                  onChange={(e) => updateField(index, { ...field, key: e.target.value })}
                  placeholder="Field name"
                  aria-label={`${AREA_LABELS[area]} custom field name`}
                  className="h-7 w-full sm:w-36 sm:shrink-0 text-xs"
                />
                <Input
                  value={field.value}
                  onChange={(e) => updateField(index, { ...field, value: e.target.value })}
                  placeholder="Value"
                  aria-label={`${AREA_LABELS[area]} custom field value`}
                  className="h-7 flex-1 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 p-0 sm:shrink-0"
                  aria-label={`Remove ${field.key || "custom input"}`}
                  onClick={() => removeField(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
