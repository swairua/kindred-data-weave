import { createContext, useContext } from "react";
import { type ApiProjectRow } from "@/types/api";

interface ProjectMetadata {
  labOrganization?: string;
  dateReported?: string;
  checkedBy?: string;
}

interface ProjectContextType {
  projectName: string;
  clientName: string;
  date: string;
  currentProjectId?: number | null;
  projectDate?: string;
  logoUrl?: string;
  contactsImageUrl?: string;
  stampImageUrl?: string;
  labOrganization?: string;
  dateReported?: string;
  checkedBy?: string;
  // Header plumbing (lifted from Index.tsx)
  projectHistory?: ApiProjectRow[];
  isLoadingProjects?: boolean;
  projectMetadata?: ProjectMetadata;
  onProjectNameChange?: (value: string) => void;
  onClientNameChange?: (value: string) => void;
  onLoadProject?: (projectId: string) => void;
  onStartNewProject?: () => void;
  onMetadataChange?: (key: "labOrganization" | "dateReported" | "checkedBy", value: string) => void;
}

export const ProjectContext = createContext<ProjectContextType>({
  projectName: "",
  clientName: "",
  date: new Date().toISOString().split("T")[0],
  currentProjectId: null,
  projectDate: undefined,
  logoUrl: undefined,
  contactsImageUrl: undefined,
  stampImageUrl: undefined,
  projectHistory: [],
  isLoadingProjects: false,
  projectMetadata: {},
});

export const useProject = () => useContext(ProjectContext);
