import { createContext, useContext } from "react";

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
});

export const useProject = () => useContext(ProjectContext);
