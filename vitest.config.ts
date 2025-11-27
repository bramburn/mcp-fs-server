import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Default to node for service tests
    globalSetup: './src/test/global-setup.ts',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/webviews/**/*.test.tsx'], // Include UI tests
    environmentMatchCriteria: {
      // Use jsdom for any test file ending in .tsx or explicitly marked
      '**/*.tsx': 'jsdom',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'scripts/**', 'build/**']
    },
    // We mock these modules because they rely on external services/files
    server: {
      deps: {
        inline: ['web-tree-sitter']
      }
    }
  },
});