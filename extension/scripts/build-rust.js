#!/usr/bin/env node
/**
 * Windows-only build script for the Rust clipboard-monitor binary.
 *
 * - Runs `cargo build --release` in the rust crate directory
 * - Ensures destination bin directory exists (extension/bin)
 * - Verifies the Windows .exe exists and copies it to extension/bin
 * - Exits with non-zero code on error
 */
import { spawn } from "child_process";
import { copyFileSync, existsSync, mkdirSync } from "fs";
import * as os from "os";
import * as path from "path";
import { join } from "path";

// --- Configuration ---
const BINARY_NAME = "clipboard-monitor";
const IS_WINDOWS = os.platform() === "win32";

// Paths
const cwd = process.cwd();
const isInExtensionDir = cwd.endsWith("extension");

// Source Directory (Rust Project)
const crateDir = isInExtensionDir
  ? join(cwd, "rust", "clipboard-monitor")
  : join(cwd, "extension", "rust", "clipboard-monitor");

// Destination Directory (Extension Bin)
const binDestDir = isInExtensionDir
  ? join(cwd, "bin")
  : join(cwd, "extension", "bin");

// --- Helper: Generate the Platform-Specific Name ---
// e.g., clipboard-monitor-win32-x64.exe or clipboard-monitor-darwin-arm64
function getPlatformSpecificName() {
  const platform = os.platform(); // 'win32', 'darwin', 'linux'
  const arch = os.arch();         // 'x64', 'arm64'

  let name = `${BINARY_NAME}-${platform}-${arch}`;
  if (IS_WINDOWS) {
    name += ".exe";
  }
  return name;
}

// --- Helper: Get Original Cargo Output Name ---
// Cargo always outputs 'clipboard-monitor' (or .exe) in target/release
// regardless of the final name we want.
function getCargoOutputName() {
  return IS_WINDOWS ? `${BINARY_NAME}.exe` : BINARY_NAME;
}

async function buildAndCopy() {
  console.log(`\n🏗️  Building Rust binary for host: ${os.platform()} (${os.arch()})...`);

  // 1. Run Cargo Build (Standard Host Build)
  // We do NOT force --target here. We let Cargo build for the current machine.
  await new Promise((resolve, reject) => {
    const cargo = spawn("cargo", ["build", "--release"], {
      cwd: crateDir,
      stdio: "inherit",
      shell: IS_WINDOWS, // Windows requires shell:true for some env path resolutions
    });

    cargo.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Cargo build failed with code ${code}`));
    });
  });

  // 2. Locate the Artifact
  // Without --target, cargo puts binaries in target/release/
  const originalBinPath = join(crateDir, "target", "release", getCargoOutputName());

  if (!existsSync(originalBinPath)) {
    throw new Error(`Build finished but binary not found at: ${originalBinPath}`);
  }

  // 3. Prepare Destination
  if (!existsSync(binDestDir)) {
    mkdirSync(binDestDir, { recursive: true });
  }

  // 4. Copy and Rename
  const finalFileName = getPlatformSpecificName();
  const destPath = join(binDestDir, finalFileName);

  console.log(`📋 Copying to: ${destPath}`);
  copyFileSync(originalBinPath, destPath);
  console.log(`✅ Success! Binary packaged for local development.\n`);
}

buildAndCopy().catch((err) => {
  console.error("❌ Build failed:", err.message);
  process.exit(1);
});