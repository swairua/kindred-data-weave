import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The page-level suites mount whole pages (sidebar, tables, charts) in jsdom, which regularly
    // takes several seconds when the whole suite runs in parallel. Without this they fail on the
    // default 5s budget even though nothing is actually broken.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
