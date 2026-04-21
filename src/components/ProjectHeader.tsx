import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { History, ChevronDown, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ApiProjectRow {
  id: number;
  name: string;
  client_name: string | null;
  project_date: string | null;
}

interface ProjectHeaderProps {
  projectName: string;
  clientName: string;
  date: string;
  projectHistory: ApiProjectRow[];
  isLoadingProjects: boolean;
  projectMetadata: {
    labOrganization?: string;
    dateReported?: string;
    checkedBy?: string;
  };
  onProjectNameChange: (value: string) => void;
  onClientNameChange: (value: string) => void;
  onLoadProject: (projectId: string) => void;
  onStartNewProject: () => void;
  onMetadataChange: (key: "labOrganization" | "dateReported" | "checkedBy", value: string) => void;
}

const ProjectHeader = ({
  projectName,
  clientName,
  date,
  projectHistory,
  isLoadingProjects,
  projectMetadata,
  onProjectNameChange,
  onClientNameChange,
  onLoadProject,
  onStartNewProject,
  onMetadataChange,
}: ProjectHeaderProps) => {
  const [showAdvancedMetadata, setShowAdvancedMetadata] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={onStartNewProject}
        >
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Project Name</Label>
          <Input
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            placeholder="Enter project name"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Client Name</Label>
          <Input
            value={clientName}
            onChange={(e) => onClientNameChange(e.target.value)}
            placeholder="Enter client name"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input value={date} readOnly className="h-9 calculated-field cursor-default" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" /> History
          </Label>
          {projectHistory.length > 0 ? (
            <Select value="" onValueChange={onLoadProject}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Load a project" />
              </SelectTrigger>
              <SelectContent>
                {projectHistory.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    <div className="flex flex-col">
                      <span className="font-medium">{project.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {project.client_name && `${project.client_name} • `}
                        {project.project_date}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="h-9 px-3 py-2 rounded-md border border-input bg-background text-muted-foreground text-sm flex items-center">
              {isLoadingProjects ? "Loading..." : "No saved projects"}
            </div>
          )}
        </div>
      </div>

      <Collapsible open={showAdvancedMetadata} onOpenChange={setShowAdvancedMetadata} className="border-t pt-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2 text-xs">
            <ChevronDown
              className="h-4 w-4 transition-transform"
              style={{
                transform: showAdvancedMetadata ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
            Advanced Metadata
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Lab Organization</Label>
              <Input
                value={projectMetadata.labOrganization || ""}
                onChange={(e) => onMetadataChange("labOrganization", e.target.value)}
                placeholder="Enter lab organization"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date Reported</Label>
              <Input
                type="date"
                value={projectMetadata.dateReported || ""}
                onChange={(e) => onMetadataChange("dateReported", e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Checked By</Label>
              <Input
                value={projectMetadata.checkedBy || ""}
                onChange={(e) => onMetadataChange("checkedBy", e.target.value)}
                placeholder="Enter name of person who checked"
                className="h-9"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default ProjectHeader;
