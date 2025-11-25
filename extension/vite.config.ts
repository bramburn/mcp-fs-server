import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    svelte({
      configFile: './svelte.config.js'
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/webviews'),
      'shared': path.resolve(__dirname, '../packages/shared')
    },
  },
  build: {
    outDir: 'out/webview',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'src/webviews/index.html'),
      },
      output: {
        // Use hash-based filenames for security and cache busting
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
      },
    },
  },
  server: {
    // Disable HMR client for VS Code webview
    hmr: false
  }
});