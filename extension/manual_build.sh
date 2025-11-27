#!/bin/bash
# Shell script to manually build the Rust binary
# Usage: chmod +x manual_build.sh && ./manual_build.sh

set -e # Exit immediately if a command exits with a non-zero status

# 1. Define Paths relative to script location
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
RUST_DIR="$SCRIPT_DIR/extension/rust/clipboard-monitor"
BIN_DIR="$SCRIPT_DIR/extension/bin"
SOURCE_BIN="$RUST_DIR/target/release/clipboard-monitor"
DEST_BIN="$BIN_DIR/clipboard-monitor"

echo "🚀 Starting Manual Build Process..."

# 2. Check for Cargo
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: cargo could not be found. Please install Rust."
    exit 1
fi

# 3. Build Rust Binary
echo "📦 Building Rust project..."
cd "$RUST_DIR"
cargo build --release
cd "$SCRIPT_DIR"

# 4. Create Bin Directory
if [ ! -d "$BIN_DIR" ]; then
    echo "📂 Creating bin directory..."
    mkdir -p "$BIN_DIR"
fi

# 5. Copy Binary
if [ -f "$SOURCE_BIN" ]; then
    echo "📋 Copying binary to bin folder..."
    cp "$SOURCE_BIN" "$DEST_BIN"
    
    # Make executable
    chmod +x "$DEST_BIN"
    
    echo "✅ Success! Binary located at: $DEST_BIN"
else
    echo "❌ Error: Build failed. Binary not found at $SOURCE_BIN"
    exit 1
fi
```
**How to run:**
```bash
chmod +x manual_build.sh
./manual_build.sh