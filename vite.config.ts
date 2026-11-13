import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api.php": {
        target: "https://lab.wayrus.co.ke",
        changeOrigin: true,
        rewrite: (path) => path,
        secure: false,
        ws: true,
      },
      "/uploads/": {
        target: "https://lab.wayrus.co.ke",
        changeOrigin: true,
        rewrite: (path) => path,
        secure: false,
        ws: true,
      },
    },
    historyApiFallback: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // Strip chatty log-level calls from the production bundle.
    // `pure` removes dead-code calls; `drop` removes the parent identifiers too.
    // Keep `console.warn`/`console.error` so support-able failures remain visible.
    minify: "esbuild",
    esbuild: {
      pure: mode === "production" ? ["console.log", "console.debug", "console.info", "console.trace"] : [],
    },
    reportCompressedSize: mode !== "production",
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep the hot paths modern; dedupe huge vendor blobs to their own chunks.
          vendorReact: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          vendorPdf: ["jspdf", "jspdf-autotable"],
          vendorExcel: ["exceljs"],
          vendorCharts: ["recharts"],
          vendorCanvas: ["html2canvas"],
          vendorUtil: ["date-fns", "clsx", "class-variance-authority", "tailwind-merge", "zod"],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
}));
