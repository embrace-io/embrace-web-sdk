#!/bin/bash
set -e

echo "🔍 Validating CLI build output..."

# 0. Run quick checks first (es-check and publint)
echo "Running es-check and publint..."
# Always run from root, CLI is in cli/ directory
cd cli
npx es-check es2022 dist/index.js --module --allow-hash-bang
npx publint
cd ..
echo "  ✅ ES compatibility and package checks passed"

# 1. Check CLI bundle exists and size
echo "Checking CLI bundle..."
# Always run from root - CLI files are at cli/dist/
CLI_FILE="cli/dist/index.js"
CLI_DIR="cli"
if [ ! -f "$CLI_FILE" ]; then
  echo "  ❌ CLI bundle not found: $CLI_FILE"
  exit 1
fi
SIZE=$(wc -c < "$CLI_FILE")
SIZE_KB=$((SIZE / 1024))
MAX_SIZE_KB=${MAX_CLI_SIZE_KB:-20}
MAX_SIZE=$((MAX_SIZE_KB * 1024))
echo "  CLI size: ${SIZE_KB}KB (${SIZE} bytes)"
if [ $SIZE -gt $MAX_SIZE ]; then
  echo "  ❌ CLI too large: ${SIZE_KB}KB (max: ${MAX_SIZE_KB}KB)"
  exit 1
else
  echo "  ✅ CLI size within limits"
fi

# 2. Verify CLI is executable
echo "Checking CLI is executable..."
if ! head -1 "$CLI_FILE" | grep -q "^#!/usr/bin/env node"; then
  echo "  ❌ Missing shebang in CLI"
  exit 1
else
  echo "  ✅ CLI has proper shebang"
fi

# 3. Test CLI can be executed
echo "Testing CLI execution..."
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Save current directory
ORIG_DIR=$(pwd)

cd $TEMP_DIR
npm init -y --quiet > /dev/null 2>&1

# Link the CLI locally (determine correct path)
if [ "$CLI_DIR" = "." ]; then
  # We're already in cli directory
  npm install "$ORIG_DIR" --quiet 2>&1
else
  # We're in root directory
  npm install "$ORIG_DIR/cli" --quiet 2>&1
fi

# Try to run the CLI with --help
if npx embrace-web-cli --help > /dev/null 2>&1; then
  echo "  ✅ CLI executes successfully"
else
  echo "  ❌ CLI failed to execute"
  exit 1
fi

# 4. Check that CLI has required commands
echo "Checking CLI commands..."
HELP_OUTPUT=$(npx embrace-web-cli --help 2>&1)

# Check for expected commands (adjust based on your CLI)
if echo "$HELP_OUTPUT" | grep -q "Commands:"; then
  echo "  ✅ CLI has command structure"
else
  echo "  ⚠️  No commands found in CLI help"
fi

cd - > /dev/null

# 5. Verify package.json bin field
echo "Checking package.json bin configuration..."
if grep -q '"embrace-web-cli"' $CLI_DIR/package.json; then
  echo "  ✅ CLI bin field configured"
else
  echo "  ❌ Missing bin configuration in package.json"
  exit 1
fi

# 6. Check ES module syntax
echo "Checking for ES module compliance..."
if grep -q "require(" "$CLI_FILE"; then
  echo "  ⚠️  Found require() calls in ESM CLI"
fi

# 7. Verify expected files
echo "Checking expected CLI files..."
if [ ! -f "$CLI_FILE" ]; then
  echo "  ❌ Missing CLI executable: $CLI_FILE"
  exit 1
fi
echo "  ✅ CLI executable present"

echo "✅ All CLI validations passed!"