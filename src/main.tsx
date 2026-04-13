import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Debug utilities for development
import "./lib/debugImageLoading";

createRoot(document.getElementById("root")!).render(<App />);
