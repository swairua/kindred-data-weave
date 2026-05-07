import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Debug utilities for development
import "./lib/debugImageLoading";
import { debugAuthState, debugApiConnectivity } from "./lib/api";

// Expose debug functions globally for console access
(window as any).__debugAuth = debugAuthState;
(window as any).__debugApi = debugApiConnectivity;

// Add error handler for unhandled rejections
window.addEventListener('error', (event) => {
  console.error('[MAIN] Unhandled error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[MAIN] Unhandled promise rejection:', event.reason);
});

try {
  console.log('[MAIN] Starting app render...');
  const root = document.getElementById("root");
  if (!root) {
    console.error('[MAIN] FATAL: Could not find #root element');
    throw new Error('Root element not found');
  }
  console.log('[MAIN] Creating React root...');
  createRoot(root).render(<App />);
  console.log('[MAIN] App rendered successfully');
} catch (error) {
  console.error('[MAIN] FATAL ERROR during render:', error);
  if (error instanceof Error) {
    console.error('[MAIN] Error stack:', error.stack);
  }
}
