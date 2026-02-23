#!/bin/bash
set -euo pipefail

# Get the absolute path to the embrace-web-sdk.js file
BUNDLE_PATH="$(realpath ../../packages/web-sdk/dist/embrace-web-sdk.js)"
MAP_PATH="${BUNDLE_PATH}.map"

# Create symlinks in sdk/public
ln -sf "$BUNDLE_PATH" "public/embrace-web-sdk.js"
ln -sf "$MAP_PATH"    "public/embrace-web-sdk.js.map"
