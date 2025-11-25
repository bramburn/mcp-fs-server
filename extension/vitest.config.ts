import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/services/**/*.test.ts',
      'src/webviews/**/*.test.ts',
      'src/webviews/**/*.test.svelte'
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
      '@': resolve(__dirname, './src/webviews'),
      'shared': resolve(__dirname, '../packages/shared')
    }
  }
});