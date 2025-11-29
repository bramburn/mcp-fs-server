import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(), // Simplified plugin usage
  ],
  resolve: {
    alias: {
      // Cleaned up: Removed legacy Svelte aliases ($app, $lib)
      // Kept only React-era aliases to match your tsconfig.json
      "@app": path.resolve(__dirname, "./src/webviews/app"),
      "@lib": path.resolve(__dirname, "./src/webviews/app/lib"),
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
        // Keep this naming convention! 
        // Even though Fluent UI is CSS-in-JS, if you ever add global styles, 
        // this ensures the WebviewController can find the expected 'index.css'.
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "assets/index.css";
          }
          return "assets/[name].[ext]";
        },
      },
    },
    minify: "esbuild",
    sourcemap: true,
  },
  server: {
    hmr: false, // HMR is disabled as it often conflicts with VS Code webview context
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development"
    ),
  },
});