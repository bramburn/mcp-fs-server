import js from '@eslint/js';
import ts from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // 1. Global ignores (replaces .eslintignore)
  {
    ignores: [
      'dist/',
      'out/',
      'build/',
      'node_modules/',
      '**/*.d.ts',
      'src/webviews/app/lib/vscode.ts',
      // Tooling / config files that aren't part of the TS project
      'postcss.config.js',
      'tailwind.config.js',
      'svelte.config.js',
      'vitest.config.ts',
      'scripts/**',
      // Legacy Svelte runes store not used by the React webview
      'src/webviews/app/store.svelte.ts',
    ],
  },

  // 2. Base JavaScript config
  js.configs.recommended,

  // 3. TypeScript config
  ...ts.configs.recommended,

  // 4. React / JSX overrides
  {
    // Limit React/TSX-specific rules (including hooks) to the webview frontend
    files: ['src/webviews/**/*.tsx', 'src/webviews/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
      parserOptions: {
        project: './tsconfig.json',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      // React
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // TypeScript – relax strictly-enforced rules for this project
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-namespace': 'off',

      // Let TypeScript handle undefined checks
      'no-undef': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
];