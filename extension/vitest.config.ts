import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/**/*.test.ts'
    ],
    exclude: [
      'node_modules',
      'out',
      'dist'
    ],
    setupFiles: ['./src/test/mocks/vscode-api.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.svelte'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.svelte',
        'src/test/**'
      ]
    }
  },
  resolve: {
    alias: {
      '$app': resolve(__dirname, './src/webviews/app'),
      'shared': resolve(__dirname, '../packages/shared'),
      'vscode': resolve(__dirname, './src/test/mocks/vscode-api.ts')
    }
  }
});