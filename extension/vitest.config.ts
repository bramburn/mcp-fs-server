import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path, { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Default to node for service / library tests. UI/webview tests should
    // opt into jsdom by adding `/** @vitest-environment jsdom */` at the top
    // of the file so they run under a DOM environment.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{js,ts,tsx}',
      'src/webviews/**/*.test.{ts,tsx}'
    ],
    exclude: [
      'node_modules',
      'out',
      'dist'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**'
      ]
    },
    // Ensure globalSetup runs first to apply node-like runtime patches
    globalSetup: './src/test/global-setup.ts',
  },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src/webviews/app'),
      '@lib': path.resolve(__dirname, './src/lib'),
      shared: resolve(__dirname, '../packages/shared'),
      vscode: resolve(__dirname, './src/test/mocks/vscode-api.ts')
    }
  }
});