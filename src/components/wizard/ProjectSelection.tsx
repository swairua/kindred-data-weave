import React, { useState, useMemo } from "react";
import { useWizard } from "@/context/WizardContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectSelectionProps {
  onNext: () => void;
  onPrev: () => void;
}

// Mock projects - in a real app, this would come from the API
const MOCK_PROJECTS = [
  { id: 1, name: "Highway Expansion Project", clientName: "Department of Transport" },
  { id: 2, name: "Commercial Development", clientName: "ABC Developers" },
  { id: 3, name: "Residential Complex", clientName: "XYZ Construction" },
  { id: 4, name: "Port Authority Works", clientName: "Port Authority" },
];

const ProjectSelection: React.FC<ProjectSelectionProps> = ({ onNext, onPrev }) => {
  const { state, setProject } = useWizard();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const filteredProjects = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return MOCK_PROJECTS.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.clientName.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  const handleSelectProject = (projectId: number, projectName: string) => {
    setProject(projectId, projectName);
  };

  const handleCreateProject = () => {
    if (newProjectName.trim()) {
      // In a real app, this would call an API to create the project
      setProject(Date.now(), newProjectName);
      setShowNewProject(false);
      setNewProjectName("");
    }
  };

  const handleNext = () => {
    if (state.projectId) {
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Select a project</h2>
        <p className="text-muted-foreground">Choose the project or create a new one</p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Projects List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredProjects.map((project) => (
          <button
            key={project.id}
            onClick={() => handleSelectProject(project.id, project.name)}
            className={cn(
              "w-full p-4 rounded-lg border-2 transition-all text-left",
              state.projectId === project.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 bg-card",
            )}
          >
            <h3 className="font-semibold text-foreground">{project.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{project.clientName}</p>
          </button>
        ))}
      </div>

      {/* Create New Project */}
      {!showNewProject && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowNewProject(true)}
          className="w-full gap-2"
        >
          <Plus className="h-4 w-4" />
          Create New Project
        </Button>
      )}

      {showNewProject && (
        <div className="space-y-3 p-4 rounded-lg bg-secondary">
          <Input
            placeholder="Project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowNewProject(false);
                setNewProjectName("");
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateProject}
              disabled={!newProjectName.trim()}
              className="flex-1"
            >
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-8">
        <Button type="button" variant="outline" onClick={onPrev}>
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={!state.projectId}
          className="gap-2"
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default ProjectSelection;
