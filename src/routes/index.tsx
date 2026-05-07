// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";

// Routed via __root.tsx -> <App /> (react-router-dom internally).
export const Route = createFileRoute("/")({
  component: () => null,
});
