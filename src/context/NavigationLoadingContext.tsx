import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface NavigationLoadingContextType {
  isNavigating: boolean;
  navigationProgress: number;
  startNavigation: () => void;
  completeNavigation: () => void;
  updateProgress: (progress: number) => void;
}

const NavigationLoadingContext = createContext<NavigationLoadingContextType>({
  isNavigating: false,
  navigationProgress: 0,
  startNavigation: () => {},
  completeNavigation: () => {},
  updateProgress: () => {},
});

export const useNavigationLoading = () => useContext(NavigationLoadingContext);

export const NavigationLoadingProvider = ({ children }: { children: ReactNode }) => {
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationProgress, setNavigationProgress] = useState(0);

  const startNavigation = useCallback(() => {
    setIsNavigating(true);
    setNavigationProgress(0);
    // Simulate progress
    let progress = 0;
    const interval = setInterval(() => {
      progress = Math.min(progress + Math.random() * 15, 90);
      setNavigationProgress(progress);
    }, 150);
    (window as unknown as { __navInterval?: NodeJS.Timeout }).__navInterval = interval;
  }, []);

  const completeNavigation = useCallback(() => {
    const interval = (window as unknown as { __navInterval?: NodeJS.Timeout }).__navInterval;
    if (interval) clearInterval(interval);
    setNavigationProgress(100);
    setTimeout(() => {
      setIsNavigating(false);
      setNavigationProgress(0);
    }, 200);
  }, []);

  const updateProgress = useCallback((progress: number) => {
    setNavigationProgress(progress);
  }, []);

  return (
    <NavigationLoadingContext.Provider value={{ isNavigating, navigationProgress, startNavigation, completeNavigation, updateProgress }}>
      {children}
    </NavigationLoadingContext.Provider>
  );
};