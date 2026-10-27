import React, { useState, useMemo } from "react";
import { useWizard } from "@/context/WizardContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import FormCard from "./FormCard";

// Mapping of test types to project categories
const testTypeToCategory: Record<string, string> = {
  attesterbergLimits: "atterberg",
  compaction: "soil",
  cbr: "soil",
  compressiveStrength: "concrete",
  pointLoad: "rock",
  slump: "concrete",
  schmidt: "rock",
  schmidt_rock: "rock",
  ucs: "rock",
};

// Mock projects with test_type - in a real app, this would come from the API
// with test_type field indicating the project's category
const MOCK_PROJECTS = [
  { id: 1, name: "Highway Expansion Project", clientName: "Department of Transport", test_type: "atterberg" },
  { id: 2, name: "Commercial Development", clientName: "ABC Developers", test_type: "concrete" },
  { id: 3, name: "Residential Complex", clientName: "XYZ Construction", test_type: "soil" },
  { id: 4, name: "Port Authority Works", clientName: "Port Authority", test_type: "rock" },
];

interface ProjectWithCategory extends Record<string, unknown> {
  test_type?: string;
}

const ProjectSelection: React.FC<ProjectSelectionProps> = ({ onNext, onPrev }) => {
  const { state, setProject } = useWizard();
  const { material, testType } = state;
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // Determine the category based on the selected test type
  const selectedCategory = useMemo(() => {
    if (!testType) return undefined;
    return testTypeToCategory[testType];
  }, [testType]);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.toLowerCase();
    
    // If we have a selected category (from test type), filter projects by category
    if (selectedCategory) {
      return MOCK_PROJECTS.filter(
        (p) => (p.test_type as string) === selectedCategory
      );
    }
    
    // No category filter - show all projects matching search query
    return MOCK_PROJECTS.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.clientName.toLowerCase().includes(query),
    );
  }, [searchQuery, selectedCategory]);

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

      <FormCard>
        {/* Search Input */}
        <div className="space-y-4">
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
        </div>
      </FormCard>

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
