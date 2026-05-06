import { createContext, useContext, ReactNode, useState } from "react";

interface TestAccordionContextType {
  openTestKey: string | null;
  setOpenTestKey: (key: string | null) => void;
}

const TestAccordionContext = createContext<TestAccordionContextType | undefined>(undefined);

export const TestAccordionProvider = ({ children }: { children: ReactNode }) => {
  const [openTestKey, setOpenTestKey] = useState<string | null>(null);

  return (
    <TestAccordionContext.Provider value={{ openTestKey, setOpenTestKey }}>
      {children}
    </TestAccordionContext.Provider>
  );
};

export const useTestAccordion = () => {
  const context = useContext(TestAccordionContext);
  if (!context) {
    throw new Error("useTestAccordion must be used within TestAccordionProvider");
  }
  return context;
};
