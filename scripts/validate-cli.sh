#!/bin/bash
set -e

CLI_FILE="cli/dist/index.js"

SIZE=$(wc -c < "$CLI_FILE" | tr -d ' ')
SIZE_KB=$((SIZE / 1024))
echo "  CLI size: ${SIZE_KB}KB (${SIZE} bytes)"

echo "🔍 Validating CLI build output..."

# Run quick checks first (es-check and publint)
echo "Running es-check and publint..."
# Always run from root
npx es-check es2022 "$CLI_FILE" --module --allow-hash-bang
(cd cli && npx publint)
echo "  ✅ ES compatibility and package checks passed"

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

# Link the CLI locally from root/cli directory
npm install "$ORIG_DIR/cli" --quiet 2>&1

# 4. Check that CLI has required commands
echo "Checking CLI commands..."
HELP_OUTPUT=$(npx embrace-web-cli --help 2>&1)

# Check for expected commands (adjust based on your CLI)
if echo "$HELP_OUTPUT" | grep -q "Commands:"; then
  echo "  ✅ CLI has command structure"
else
  echo "  X  No commands found in CLI help"
  exit 1
fi

cd "$ORIG_DIR"

echo "✅ All CLI validations passed!"
