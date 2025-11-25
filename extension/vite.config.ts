import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// P0.2: Configure Build System for Svelte Webview
// Fixed: Ensure compatibility with Vite 5.x and Svelte 5
export default defineConfig({
  plugins: [
    svelte({
      configFile: './svelte.config.js'
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/webviews'),
    },
  },
  build: {
    // Output compiled webview assets to 'out/webview'
    outDir: 'out/webview',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Entry point for the webview
        index: path.resolve(__dirname, 'src/webviews/index.html'),
      },
      output: {
        // Ensure predictable filenames for VS Code to load
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});