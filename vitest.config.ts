import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
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