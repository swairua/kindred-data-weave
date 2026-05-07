import React, { createContext, useContext, useState } from "react";

export type WizardStep = "material" | "testType" | "project" | "sample" | "dataEntry";
export type MaterialType = "soil" | "rock" | "concrete";

export interface WizardState {
  currentStep: WizardStep;
  material: MaterialType | null;
  testType: string | null;
  projectId: number | null;
  projectName: string | null;
  sampleId: string | null;
  sampleDepthFrom: string | null;
  sampleDepthTo: string | null;
  recordId: string | null;
}

interface WizardContextType {
  state: WizardState;
  goToStep: (step: WizardStep) => void;
  setMaterial: (material: MaterialType) => void;
  setTestType: (testType: string) => void;
  setProject: (projectId: number, projectName: string) => void;
  setSample: (sampleId: string, depthFrom: string, depthTo: string) => void;
  setRecordId: (recordId: string) => void;
  reset: () => void;
  canProceed: () => boolean;
}

const initialState: WizardState = {
  currentStep: "material",
  material: null,
  testType: null,
  projectId: null,
  projectName: null,
  sampleId: null,
  sampleDepthFrom: null,
  sampleDepthTo: null,
  recordId: null,
};

const WizardContext = createContext<WizardContextType | undefined>(undefined);

export const WizardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<WizardState>(initialState);

  const goToStep = (step: WizardStep) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  };

  const setMaterial = (material: MaterialType) => {
    setState((prev) => ({ ...prev, material }));
  };

  const setTestType = (testType: string) => {
    setState((prev) => ({ ...prev, testType }));
  };

  const setProject = (projectId: number, projectName: string) => {
    setState((prev) => ({ ...prev, projectId, projectName }));
  };

  const setSample = (sampleId: string, depthFrom: string, depthTo: string) => {
    setState((prev) => ({ ...prev, sampleId, sampleDepthFrom: depthFrom, sampleDepthTo: depthTo }));
  };

  const setRecordId = (recordId: string) => {
    setState((prev) => ({ ...prev, recordId }));
  };

  const reset = () => {
    setState(initialState);
  };

  const canProceed = (): boolean => {
    switch (state.currentStep) {
      case "material":
        return state.material !== null;
      case "testType":
        return state.testType !== null;
      case "project":
        return state.projectId !== null;
      case "sample":
        return state.sampleId !== null && state.sampleDepthFrom !== null && state.sampleDepthTo !== null;
      case "dataEntry":
        return state.recordId !== null;
      default:
        return false;
    }
  };

  const value: WizardContextType = {
    state,
    goToStep,
    setMaterial,
    setTestType,
    setProject,
    setSample,
    setRecordId,
    reset,
    canProceed,
  };

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
};

export const useWizard = () => {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useWizard must be used within a WizardProvider");
  }
  return context;
};
