import { useEffect, useState } from "react";
import { isDemoMode, subscribeDemoModeChanged } from "@/lib/demoMode";

/** Reactive view of the demo-mode flag (also updates from other tabs). */
export const useDemoMode = (): boolean => {
  const [enabled, setEnabled] = useState<boolean>(() => isDemoMode());

  useEffect(() => subscribeDemoModeChanged(() => setEnabled(isDemoMode())), []);

  return enabled;
};
