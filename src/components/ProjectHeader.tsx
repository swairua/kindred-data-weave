import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { History, ChevronDown } from "lucide-react";
import { type ApiProjectRow } from "@/types/api";
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
  hasLoadedProject?: boolean;
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
  hasLoadedProject = false,
}: ProjectHeaderProps) => {
  const [showAdvancedMetadata, setShowAdvancedMetadata] = useState(false);

  return (
    <div className="space-y-3">
      {/* Project Name and Client Name - show when project is loaded */}
      {hasLoadedProject && (
        <>
          <div className="space-y-1">
            <Label className="text-xs sm:text-sm text-muted-foreground">Project name</Label>
            <Input
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              placeholder="Enter project name"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs sm:text-sm text-muted-foreground">Client name</Label>
            <Input
              value={clientName}
              onChange={(e) => onClientNameChange(e.target.value)}
              placeholder="Enter client name"
              className="h-9 text-sm"
            />
          </div>
        </>
      )}

      {/* History dropdown - minimal layout */}
      <div className="hidden space-y-1">
        <Label className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" /> History
        </Label>
        {projectHistory.length > 0 ? (
          <Select value="" onValueChange={onLoadProject}>
            <SelectTrigger className="h-9 text-sm">
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
  );
};

export default ProjectHeader;
