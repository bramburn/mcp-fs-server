#!/usr/bin/env node

import { mkdirSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = resolve(__dirname, '..');
const pkgJsonPath = resolve(rootDir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

const name = pkg.name || 'extension';
const version = pkg.version || '0.0.0';

const binDir = resolve(rootDir, 'bin');
mkdirSync(binDir, { recursive: true });

const outPath = resolve(binDir, `${name}-${version}.vsix`);
console.log(`Packaging VS Code extension to: ${outPath}`);

const result = spawnSync('npx', ['vsce', 'package', '--out', outPath], {
  stdio: 'inherit',
  shell: true,
  cwd: rootDir,
});

if (result.status !== 0) {
  console.error(`vsce package failed with exit code ${result.status}`);
  process.exit(result.status ?? 1);
}
