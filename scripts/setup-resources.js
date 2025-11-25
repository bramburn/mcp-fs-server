const fs = require('fs');
const path = require('path');

// Ensure resources directory exists
const resourcesDir = path.resolve(__dirname, '../resources');
if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
}

// 1. Copy tree-sitter.wasm from node_modules
const treeSitterWasmSource = path.resolve(__dirname, '../node_modules/web-tree-sitter/tree-sitter.wasm');
const treeSitterWasmDest = path.join(resourcesDir, 'tree-sitter.wasm');

try {
    if (fs.existsSync(treeSitterWasmSource)) {
        fs.copyFileSync(treeSitterWasmSource, treeSitterWasmDest);
        console.log('✅ Copied tree-sitter.wasm');
    } else {
        console.warn('⚠️  Could not find tree-sitter.wasm in node_modules. Run pnpm install first.');
    }
} catch (err) {
    console.error('❌ Failed to copy tree-sitter.wasm:', err);
}

// 2. Setup Language WASM (TypeScript)
// In a real scenario, you might download this or copy from a package like `tree-sitter-typescript`
// For P1, we will provide a placeholder instructions or attempt to copy if root has it.
const rootWasmPath = path.resolve(__dirname, '../../resources/tree-sitter-typescript.wasm');
const langWasmDest = path.join(resourcesDir, 'tree-sitter-typescript.wasm');

if (fs.existsSync(rootWasmPath)) {
    fs.copyFileSync(rootWasmPath, langWasmDest);
    console.log('✅ Copied tree-sitter-typescript.wasm from root');
} else {
    // Fallback: Instructions for P1
    console.log('ℹ️  Note: Ensure tree-sitter-typescript.wasm is present in extension/resources/');
    console.log('   You can download it from: https://github.com/tree-sitter/tree-sitter-typescript/releases');
}