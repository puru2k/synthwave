import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const emptyShim = fileURLToPath(new URL("./src/lib/empty-shim.js", import.meta.url));

export default defineConfig({
  // "/" for a root domain (Netlify/Cloudflare/user.github.io) or "/<repo>/" for
  // a GitHub Pages project site. The deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  resolve: {
    alias: {
      // elkjs statically requires this Node-only module but never calls it in-browser.
      "webworker-threads": emptyShim,
    },
  },
  optimizeDeps: {
    // Vite's dependency pre-bundler runs esbuild, which does NOT honor
    // resolve.alias — so stub the Node-only require here too, otherwise dev
    // dependency optimization fails with "Could not resolve webworker-threads".
    esbuildOptions: {
      plugins: [
        {
          name: "stub-webworker-threads",
          setup(build) {
            build.onResolve({ filter: /^webworker-threads$/ }, () => ({ path: emptyShim }));
          },
        },
      ],
    },
  },
  server: {
    port: 5173,
    // Native fs events don't reliably reach Vite in this environment, so HMR
    // would miss edits. Polling guarantees changes are picked up.
    watch: {
      usePolling: true,
      interval: 250,
    },
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
