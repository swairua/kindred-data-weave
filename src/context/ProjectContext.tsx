import { createContext, useContext } from "react";

interface ProjectContextType {
  projectName: string;
  clientName: string;
  date: string;
}

export const ProjectContext = createContext<ProjectContextType>({
  projectName: "",
  clientName: "",
  date: new Date().toISOString().split("T")[0],
});

export const useProject = () => useContext(ProjectContext);
