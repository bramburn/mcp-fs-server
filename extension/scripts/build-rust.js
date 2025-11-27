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

// Determine if we're running from the extension directory or the root
const cwd = process.cwd();
const isInExtensionDir = cwd.endsWith("extension");
const crateDir = isInExtensionDir
  ? join(cwd, "rust", "clipboard-monitor")
  : join(cwd, "extension", "rust", "clipboard-monitor");
const targetReleaseDir = join(crateDir, "target", "release");
const binDestDir = isInExtensionDir
  ? join(cwd, "bin")
  : join(cwd, "extension", "bin");

// Windows binary name (no platform suffix logic - Windows-only)
const binaryName = "clipboard-monitor.exe";
const compiledBinaryPath = join(targetReleaseDir, binaryName);
const destBinaryPath = join(binDestDir, binaryName);

// Use cargo from PATH; on Windows users typically have cargo in PATH.
const cargoCmd =
  process.platform === "win32"
    ? path.join(os.homedir(), ".cargo", "bin", "cargo.exe")
    : "cargo";

function runCargoBuild() {
  return new Promise((resolve, reject) => {
    console.log(`Running cargo build --release in ${crateDir}`);
    console.log(`Using cargo: ${cargoCmd}`);
    // On Windows, use shell: false to avoid cmd.exe issues
    // cargo.exe is directly executable
    const cargo = spawn(cargoCmd, ["build", "--release"], {
      cwd: crateDir,
      stdio: "inherit",
      shell: false,
    });

    cargo.on("error", (err) => {
      reject(new Error(`Failed to start cargo: ${err.message}`));
    });

    cargo.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`cargo build exited with code ${code}`));
      }
    });
  });
}

async function main() {
  try {
    await runCargoBuild();

    // ensure destination directory exists
    if (!existsSync(binDestDir)) {
      console.log(`Creating bin directory at ${binDestDir}`);
      mkdirSync(binDestDir, { recursive: true });
    }

    // verify compiled Windows binary exists
    if (!existsSync(compiledBinaryPath)) {
      throw new Error(
        `Compiled Windows binary not found at ${compiledBinaryPath}. Ensure 'cargo build --release' succeeded and produced ${binaryName}.`
      );
    }

    // copy binary
    console.log(`Copying ${compiledBinaryPath} -> ${destBinaryPath}`);
    copyFileSync(compiledBinaryPath, destBinaryPath);

    console.log("Windows Rust binary build and copy completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error(
      "Error building Windows Rust binary:",
      err && err.message ? err.message : err
    );
    process.exit(1);
  }
}

main();
