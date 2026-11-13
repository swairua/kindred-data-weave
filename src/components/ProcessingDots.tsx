import { useEffect, useState } from "react";

/**
 * Animated dots used by export/print buttons while they are working.
 * Cycles 0..3 dots at ~350 ms intervals so long-running jsPDF / print
 * pipelines cannot silently strand the user on a clickable button.
 */
export const useAnimatedDots = (intervalMs = 350): string => {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setDots((value) => (value + 1) % 4), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return ".".repeat(dots);
};

export const AnimatedDots = ({ className }: { className?: string }) => {
  const dots = useAnimatedDots();
  return <span className={className} aria-hidden="true">{dots}</span>;
};
