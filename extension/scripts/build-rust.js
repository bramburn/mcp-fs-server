#!/usr/bin/env node
import { spawn } from "child_process";
import { copyFileSync, existsSync, mkdirSync } from "fs";
import * as os from "os";
import { join } from "path";

const IS_WINDOWS = os.platform() === "win32";

// Paths
const cwd = process.cwd();
const isInExtensionDir = cwd.endsWith("extension");

function getRustDir(binaryName) {
  return isInExtensionDir
    ? join(cwd, "rust", binaryName)
    : join(cwd, "extension", "rust", binaryName);
}

const binDestDir = isInExtensionDir
  ? join(cwd, "bin")
  : join(cwd, "extension", "bin");

// Platform-specific binary naming
function getPlatformSpecificName(baseName) {
  const platform = os.platform();
  const arch = os.arch();
  let name = `${baseName}-${platform}-${arch}`;
  if (IS_WINDOWS) {
    name += ".exe";
  }
  return name;
}

// Build a single binary
async function buildBinary(binaryName) {
  const crateDir = getRustDir(binaryName);
  console.log(
    `\n🏗️  Building ${binaryName} for host: ${os.platform()} (${os.arch()})...`
  );

  await new Promise((resolve, reject) => {
    const cargo = spawn("cargo", ["build", "--release"], {
      cwd: crateDir,
      stdio: "inherit",
      shell: IS_WINDOWS,
    });

    cargo.on("exit", (code) => {
      if (code === 0) resolve(code);
      else reject(new Error(`Cargo build failed with code ${code}`));
    });
  });

  const originalBinPath = join(
    crateDir,
    "target",
    "release",
    IS_WINDOWS ? `${binaryName}.exe` : binaryName
  );

  if (!existsSync(originalBinPath)) {
    throw new Error(
      `Build finished but binary not found at: ${originalBinPath}`
    );
  }

  if (!existsSync(binDestDir)) {
    mkdirSync(binDestDir, { recursive: true });
  }

  const finalFileName = getPlatformSpecificName(binaryName);
  const destPath = join(binDestDir, finalFileName);
  console.log(`📋 Copying ${binaryName} to: ${destPath}`);
  copyFileSync(originalBinPath, destPath);
  console.log(`✅ Success! ${binaryName} packaged for local development.\n`);
}

// Build all binaries
async function buildAll() {
  try {
    await buildBinary("clipboard-monitor");
    await buildBinary("clipboard-files");
    console.log("🎉 All Rust binaries built successfully!");
  } catch (err) {
    console.error("❌ Build failed:", err.message);
    process.exit(1);
  }
}

buildAll();
