import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // 1. Global Ignores (replaces .eslintignore)
  {
    ignores: [
      "dist/",
      "out/",
      "build/",
      "node_modules/",
      "**/*.d.ts",
      "src/webviews/app/lib/vscode.ts" // Ignore specific vendored/mock files if needed
    ]
  },

  // 2. Base Javascript Config
  js.configs.recommended,

  // 3. TypeScript Config (Merged recommended + styling)
  ...ts.configs.recommended,

  // 4. Svelte Config (Svelte 5 compatible)
  ...svelte.configs['flat/recommended'],

  // 5. Specific Overrides
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      }
    }
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.svelte"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2017,
        ...globals.node
      },
      parserOptions: {
        project: "./tsconfig.json", // Ensure this points to your extension/tsconfig.json
        extraFileExtensions: [".svelte"]
      }
    },
    rules: {
      // Customize rules here to match previous behavior
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-undef": "off" // TypeScript handles this usually
    }
  }
];