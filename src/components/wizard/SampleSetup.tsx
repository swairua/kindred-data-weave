import React from "react";
import { useWizard } from "@/context/WizardContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight } from "lucide-react";

interface SampleSetupProps {
  onNext: () => void;
  onPrev: () => void;
}

const SampleSetup: React.FC<SampleSetupProps> = ({ onNext, onPrev }) => {
  const { state, setSample } = useWizard();
  const [sampleId, setSampleId] = React.useState(state.sampleId || "");
  const [depthFrom, setDepthFrom] = React.useState(state.sampleDepthFrom || "");
  const [depthTo, setDepthTo] = React.useState(state.sampleDepthTo || "");

  const isValid = sampleId.trim() !== "" && depthFrom.trim() !== "" && depthTo.trim() !== "";

  const handleNext = () => {
    if (isValid) {
      setSample(sampleId, depthFrom, depthTo);
      onNext();
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Sample setup</h2>
        <p className="text-muted-foreground">Enter sample identification and depth information</p>
      </div>

      <div className="space-y-6 max-w-md mx-auto">
        {/* Sample ID */}
        <div className="space-y-2">
          <Label htmlFor="sample-id" className="font-medium">
            Sample ID *
          </Label>
          <Input
            id="sample-id"
            placeholder="e.g. BH5"
            value={sampleId}
            onChange={(e) => setSampleId(e.target.value)}
            className="text-base"
          />
          <p className="text-xs text-muted-foreground">Unique identifier for this sample</p>
        </div>

        {/* Depth Fields */}
        <div className="space-y-2">
          <Label className="font-medium">Sample depth (M) *</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                placeholder="From"
                type="number"
                step="0.01"
                value={depthFrom}
                onChange={(e) => setDepthFrom(e.target.value)}
                className="text-base"
              />
            </div>
            <div>
              <Input
                placeholder="To"
                type="number"
                step="0.01"
                value={depthTo}
                onChange={(e) => setDepthTo(e.target.value)}
                className="text-base"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Depth range in meters</p>
        </div>

        {/* Status Message */}
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-sm text-primary font-medium">
            ✓ Sample setup complete
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Ready to proceed to data entry
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-8 max-w-md mx-auto w-full">
        <Button type="button" variant="outline" onClick={onPrev}>
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={!isValid}
          className="gap-2"
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default SampleSetup;
