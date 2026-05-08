import React from "react";
import { useWizard, type MaterialType } from "@/context/WizardContext";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import FormCard from "./FormCard";

interface MaterialSelectionProps {
  onNext: () => void;
}

const materials: { id: MaterialType; emoji: string; name: string; description: string }[] = [
  { id: "soil", emoji: "🪨", name: "Soil", description: "Soil & clay testing" },
  { id: "rock", emoji: "⛰️", name: "Rock", description: "Rock & aggregate testing" },
  { id: "concrete", emoji: "🏗️", name: "Concrete", description: "Concrete properties" },
];

const MaterialSelection: React.FC<MaterialSelectionProps> = ({ onNext }) => {
  const { state, setMaterial } = useWizard();

  const handleSelect = (material: MaterialType) => {
    setMaterial(material);
  };

  const handleNext = () => {
    if (state.material) {
      onNext();
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">What are we testing?</h2>
        <p className="text-muted-foreground">Select the material type for this test</p>
      </div>

      <FormCard>
        <div className="grid gap-4 sm:grid-cols-3">
          {materials.map((material) => (
            <button
              key={material.id}
              onClick={() => handleSelect(material.id)}
              className={cn(
                "p-6 rounded-lg border-2 transition-all text-left",
                state.material === material.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 bg-card",
              )}
            >
              <div className="text-4xl mb-3">{material.emoji}</div>
              <h3 className="font-semibold text-foreground mb-1">{material.name}</h3>
              <p className="text-sm text-muted-foreground">{material.description}</p>
            </button>
          ))}
        </div>
      </FormCard>

      <div className="flex justify-end pt-8">
        <Button
          onClick={handleNext}
          disabled={!state.material}
          className="gap-2"
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default MaterialSelection;
