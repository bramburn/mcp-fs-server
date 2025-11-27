# Windows Build Configuration - POC Setup

## ✅ Build Status: WORKING

This document describes the Windows-only Proof of Concept (POC) build configuration for the VS Code extension with Rust clipboard monitoring.

---

## 🎯 Overview

The extension integrates a **Rust-based clipboard monitor** (`clipboard-monitor.exe`) that runs as a background process to detect system-wide clipboard changes and communicate them to the VS Code extension via JSON over stdout.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ VS Code Extension (TypeScript)                              │
│  ├─ Container.ts                                            │
│  └─ ClipboardService.ts                                     │
│      └─ spawn() ──────────────────────────────────────────┐ │
└───────────────────────────────────────────────────────────┼─┘
                                                            │
                                                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Rust Binary (clipboard-monitor.exe)                        │
│  ├─ Polls system clipboard every 500ms                     │
│  ├─ Detects changes via MD5 hash                           │
│  └─ Outputs JSON to stdout                                 │
│      {"type":"clipboard_update","content":"..."}           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Build Configuration

### 1. Rust Binary Build Script

**File:** `extension/scripts/build-rust.js`

- **Purpose:** Builds the Rust binary and copies it to `extension/bin/`
- **Platform:** Windows-only (x64)
- **Key Features:**
  - Auto-detects if running from extension directory or workspace root
  - Uses `cargo build --release` with `shell: false` to avoid cmd.exe issues
  - Validates binary exists before copying
  - Exits with error code on failure

**Usage:**
```bash
npm run build:rust
```

### 2. NPM Scripts

**File:** `extension/package.json`

```json
{
  "scripts": {
    "build:rust": "node ./scripts/build-rust.js",
    "compile": "npm run build:rust && tsc -p ./tsconfig.json && node ./scripts/setup-resources.js && npm run build:webview"
  },
  "files": [
    "out/",
    "bin/",
    "resources/",
    "package.json",
    "README.md",
    "LICENSE.md"
  ]
}
```

**Build Order:**
1. ✅ Build Rust binary → `bin/clipboard-monitor.exe`
2. ✅ Compile TypeScript → `out/extension/**/*.js`
3. ✅ Copy WASM resources → `resources/*.wasm`
4. ✅ Build webview (Vite) → `out/webview/**/*`

### 3. VS Code Tasks

**File:** `.vscode/tasks.json`

Added task for building Rust binary:

```json
{
  "label": "build:rust:windows",
  "type": "npm",
  "script": "build:rust",
  "path": "extension"
}
```

This task is automatically invoked by the `npm: compile` task.

### 4. Launch Configuration

**File:** `.vscode/launch.json`

The existing launch configurations use `preLaunchTask: "npm: compile"` which ensures the Rust binary is built before debugging.

**To debug (F5):**
- Select "Run Extension (No Watch)" or "Run Extension (Dev Env)"
- Press F5
- The Rust binary will be built automatically before the extension starts

---

## 📦 Binary Location & Discovery

The `ClipboardService` searches for the binary in the following order:

1. `extension/rust/clipboard-monitor/target/release/clipboard-monitor.exe` (dev)
2. `extension/rust/clipboard-monitor/target/debug/clipboard-monitor.exe` (dev)
3. `extension/bin/clipboard-monitor.exe` (packaged) ✅ **Primary**
4. `extension/resources/clipboard-monitor.exe` (fallback)

**For VSIX packaging:** The `bin/` directory is explicitly included in `package.json` `files` array.

---

## 🚀 Quick Start

### Prerequisites
- Rust toolchain installed (`cargo --version`)
- Node.js 20+ installed
- Windows 10/11 (x64)

### Build Commands

```powershell
# From extension directory
cd extension

# Build everything (Rust + TypeScript + Webview)
npm run compile

# Build only Rust binary
npm run build:rust

# Run extension in debug mode
# Press F5 in VS Code
```

### Verify Build

```powershell
# Check binary exists
Get-Item bin\clipboard-monitor.exe

# Expected output:
# FullName: C:\...\extension\bin\clipboard-monitor.exe
# Length: ~154KB
```

---

## 🧪 Testing the POC

1. **Start the extension** (F5)
2. **Open Output panel** → Select "Qdrant Code Search"
3. **Copy text** outside VS Code (e.g., from Notepad)
4. **Observe:**
   - Output log: `[clipboard-monitor stdout] {"type":"clipboard_update",...}`
   - VS Code notification: "Clipboard updated from system"

---

## 📝 Key Files

| File | Purpose |
|------|---------|
| `extension/scripts/build-rust.js` | Rust build automation |
| `extension/manual_build.ps1` | Manual PowerShell build script (alternative) |
| `extension/rust/clipboard-monitor/src/main.rs` | Rust clipboard monitor logic |
| `extension/rust/clipboard-monitor/src/protocol.rs` | JSON message protocol |
| `extension/src/services/ClipboardService.ts` | TypeScript bridge to Rust binary |
| `extension/src/container/Container.ts` | Service initialization |

---

## ✅ Build Verification Checklist

- [x] Rust binary builds successfully
- [x] Binary copied to `bin/clipboard-monitor.exe`
- [x] TypeScript compiles without errors
- [x] Webview builds successfully
- [x] WASM resources copied to `resources/`
- [x] `npm run compile` completes end-to-end
- [x] F5 debug launches extension
- [x] ClipboardService finds and spawns binary
- [x] Binary outputs JSON to stdout
- [x] Extension receives and processes clipboard updates

---

**Status:** ✅ All systems operational for Windows POC

