#!/usr/bin/env node

/**
 * Setup script for extension resources.
 *
 * Copies all .wasm files from the repo-level ./wasm directory into
 * ./extension/resources so that the packaged VS Code extension can
 * load Tree-sitter grammars at runtime.
 */

import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const extensionRoot = resolve(__dirname, '..');
const repoRoot = resolve(extensionRoot, '..');
const wasmSourceDir = resolve(repoRoot, 'wasm');
const resourcesDir = resolve(extensionRoot, 'resources');

console.log('[qdrant-codesearch] Setting up extension resources...');

try {
  // If there is no top-level wasm directory, skip gracefully so the
  // extension can still be developed independently.
  try {
    const stat = statSync(wasmSourceDir);
    if (!stat.isDirectory()) {
      console.warn(`[qdrant-codesearch] wasm path is not a directory: ${wasmSourceDir}`);
      process.exit(0);
    }
  } catch {
    console.warn(`[qdrant-codesearch] No wasm directory found at ${wasmSourceDir}, skipping copy.`);
    process.exit(0);
  }

  mkdirSync(resourcesDir, { recursive: true });

  const entries = readdirSync(wasmSourceDir, { withFileTypes: true });
  let copied = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.wasm')) continue;

    const from = resolve(wasmSourceDir, entry.name);
    const to = resolve(resourcesDir, entry.name);

    copyFileSync(from, to);
    copied++;
  }

  console.log(`[qdrant-codesearch] Copied ${copied} wasm file(s) into ${resourcesDir}`);
  console.log('[qdrant-codesearch] Resource setup complete.');
} catch (error) {
  console.error('[qdrant-codesearch] Failed to set up extension resources:', error);
  // Fail the build so we don't silently ship a broken extension.
  process.exit(1);
}

