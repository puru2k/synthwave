import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles.css";
import { registerServiceWorker } from "./lib/toolchain";

// Monaco's AMD loader injects a global `define` with `define.amd = { jQuery: true }`.
// When UMD packages (like Lodash inside netlistsvg) load, they see `define.amd`,
// assume an AMD environment, call `define()`, and skip setting `module.exports`,
// causing `_.mapValues is not a function`.
// We intercept `window.define` so `define.amd` is disabled for non-Monaco scripts.
if (typeof window !== "undefined") {
  let _define = (window as any).define;
  try {
    Object.defineProperty(window, "define", {
      get() {
        return _define;
      },
      set(fn) {
        _define = fn;
        if (_define && typeof _define === "function") {
          try {
            _define.amd = false;
          } catch {}
        }
      },
      configurable: true,
      enumerable: true,
    });
  } catch {}
}

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
