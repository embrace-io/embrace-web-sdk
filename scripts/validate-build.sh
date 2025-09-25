#!/bin/bash
set -e

echo "🔍 Validating SDK build output..."

DIST_DIR="dist"
BUNDLE_FILE="dist/embrace-web-sdk.js"

# Run quick checks first (es-check and publint)
echo "Running es-check and publint..."
npx es-check es6 $BUNDLE_FILE --module
npx es-check es2022 --module "$DIST_DIR/**/*.js" --not $BUNDLE_FILE
npx es-check es2022 "$DIST_DIR/**/*.cjs"

npx publint
echo "  ✅ ES compatibility and package checks passed"

# 1. Bundle size check
echo "Checking IIFE CDN bundle size..."
RAW_SIZE=$(cat $BUNDLE_FILE | wc -c | tr -d ' ')
RAW_SIZE_KB=$((RAW_SIZE / 1024))
echo "  Raw size: ${RAW_SIZE_KB}KB (${RAW_SIZE} bytes)"

SIZE=$(gzip -c $BUNDLE_FILE | wc -c | tr -d ' ')
SIZE_KB=$((SIZE / 1024))
echo "  Bundle size (gzipped): ${SIZE_KB}KB (${SIZE} bytes)"

# 2. Verify package exports
echo "Verifying package exports..."
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

npm pack --quiet
mv embrace-io-web-sdk-*.tgz $TEMP_DIR/
cd $TEMP_DIR
npm init -y --quiet > /dev/null 2>&1
npm install ./embrace-io-web-sdk-*.tgz --quiet

# Test ESM import
node --input-type=module -e "
import { initSDK, log, trace, session, user } from '@embrace-io/web-sdk';
if (!initSDK || !log || !trace || !session || !user) process.exit(1);
console.log('  ✅ ESM imports work');
"

# Test CJS require
node -e "
const sdk = require('@embrace-io/web-sdk');
if (!sdk.initSDK || !sdk.log || !sdk.trace || !sdk.session || !sdk.user) process.exit(1);
console.log('  ✅ CommonJS require works');
"

cd - > /dev/null

# 3. Check for accidental require() in ESM files
echo "Checking for unexpected requires in ESM files..."
if grep -r "require(" $DIST_DIR --include="*.js" --exclude="*.cjs" > /dev/null 2>&1; then
  echo "  ❌ Found unexpected require() calls in ESM files:"
  grep -r "require(" $DIST_DIR --include="*.js" --exclude="*.cjs"
  exit 1
else
  echo "  ✅ No unexpected require() calls found"
fi

# 4. Check for accidental imports in CommonJS files
echo "Checking for unexpected imports in CommonJS files..."
if grep -r "import" $DIST_DIR --include="*.cjs" > /dev/null 2>&1; then
  echo "  ❌ Found unexpected imports in CommonJS files:"
  grep -r "import" $DIST_DIR --include="*.cjs"
  exit 1
else
  echo "  ✅ No unexpected imports found"
fi

# 4. Validate sourcemaps
echo "Validating sourcemaps..."
MAP_FILE="$DIST_DIR/embrace-web-sdk.js.map"

if [ ! -f "$MAP_FILE" ]; then
  echo "  ❌ Sourcemap not found"
  exit 1
fi

# Check sourcemap is valid JSON and has sources
node -e "
const fs = require('fs');
try {
  const map = JSON.parse(fs.readFileSync('$MAP_FILE', 'utf8'));
  if (!map.sources || map.sources.length === 0) {
    console.error('  ❌ Sourcemap has no sources');
    process.exit(1);
  }
  console.log('  ✅ Sourcemap is valid (' + map.sources.length + ' sources)');
} catch (e) {
  console.error('  ❌ Invalid sourcemap JSON:', e.message);
  process.exit(1);
}
"

# 5. Check sourcemap reference in bundle
echo "Checking sourcemap reference..."
if ! tail -1 $BUNDLE_FILE | grep -q "sourceMappingURL="; then
  echo "  ❌ Missing sourcemap reference in bundle"
  exit 1
else
  echo "  ✅ Sourcemap reference present"
fi

# 6. Performance check - measure basic load time
echo "Checking load performance..."
START=$(node -e "console.log(Date.now())")
node -e "require('@embrace-io/web-sdk')"
END=$(node -e "console.log(Date.now())")
LOAD_TIME=$((END - START))
echo "  Load time: ${LOAD_TIME}ms"
if [ $LOAD_TIME -gt 500 ]; then
  echo "  ⚠️  Warning: Slow load time (${LOAD_TIME}ms)"
fi

# 7. Check that all expected files exist
echo "Checking expected files..."
EXPECTED_FILES=(
  "dist/embrace-web-sdk.js"
  "dist/embrace-web-sdk.js.map"
  "dist/index.js"
  "dist/index.d.ts"
  "dist/index.cjs"
  "dist/index.d.cts"
)

for FILE in "${EXPECTED_FILES[@]}"; do
  if [ ! -f "$FILE" ]; then
    echo "  ❌ Missing expected file: $FILE"
    exit 1
  fi
done
echo "  ✅ All expected files present"

echo "✅ All build validations passed!"
