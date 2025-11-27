$ErrorActionPreference = "Stop"

# 1. Define Paths
$ExtensionRoot = Get-Location
$RustDir = Join-Path $ExtensionRoot "rust\clipboard-monitor"
$BinDir = Join-Path $ExtensionRoot "bin"
$SourceBin = Join-Path $RustDir "target\release\clipboard-monitor.exe"
$DestBin = Join-Path $BinDir "clipboard-monitor.exe"

Write-Host "[*] Starting Manual Build Process..." -ForegroundColor Cyan

# 2. Check for Cargo
if (-not (Get-Command "cargo" -ErrorAction SilentlyContinue)) {
    Write-Error "Cargo is not installed or not in PATH. Please install Rust."
}

# 3. Build Rust Binary
Write-Host "[*] Building Rust project..." -ForegroundColor Yellow
Push-Location $RustDir
try {
    cargo build --release
}
finally {
    Pop-Location
}

# 4. Create Bin Directory
if (-not (Test-Path $BinDir)) {
    Write-Host "[*] Creating bin directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

# 5. Copy Binary
if (Test-Path $SourceBin) {
    Write-Host "[*] Copying binary to bin folder..." -ForegroundColor Yellow
    Copy-Item -Path $SourceBin -Destination $DestBin -Force
    Write-Host "[OK] Success! Binary located at: $DestBin" -ForegroundColor Green
}
else {
    Write-Error "Build failed. Binary not found at $SourceBin"
}