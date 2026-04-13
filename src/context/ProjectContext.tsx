import { createContext, useContext } from "react";

interface ProjectContextType {
  projectName: string;
  clientName: string;
  date: string;
  currentProjectId?: number | null;
  projectDate?: string; // The actual date of the loaded project (not today's date)
  logoUrl?: string; // Base64 data URL for logo image
  contactsImageUrl?: string; // Base64 data URL for contacts image
  stampImageUrl?: string; // Base64 data URL for stamp image
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
