import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react({
      // Rely on default React plugin behavior; explicit fastRefresh flag has
      // been removed to satisfy the current @vitejs/plugin-react Options type.
      babel: {
        plugins: [],
      },
    }),
  ],
  resolve: {
    alias: {
      // Legacy Svelte-era aliases (kept temporarily for gradual migration)
      $app: path.resolve(__dirname, "./src/webviews/app"),
      $lib: path.resolve(__dirname, "./src/lib"),
      shared: path.resolve(__dirname, "../packages/shared"),
      // New React-era aliases
      "@app": path.resolve(__dirname, "./src/webviews/app"),
      "@lib": path.resolve(__dirname, "./src/lib"),
      "@shared": path.resolve(__dirname, "../packages/shared"),
    },
  },
  build: {
    outDir: "out/webview",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "src/webviews/index.html"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
    minify: "esbuild",
    sourcemap: true,
  },
  server: {
    // Disable HMR client for VS Code webview
    hmr: false,
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development"
    ),
  },
});
