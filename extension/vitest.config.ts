import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path, { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
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
    }
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