#!/bin/bash
set -euo pipefail

# Get the absolute path to the bundle.js file
BUNDLE_PATH="$(realpath ../../build/iife/bundle.js)"
MAP_PATH="${BUNDLE_PATH}.map"

# Create symlinks in sdk/public
ln -sf "$BUNDLE_PATH" "sdk/public/bundle.js"
ln -sf "$MAP_PATH"    "sdk/public/bundle.js.map"

# Create symlinks in host/public
ln -sf "$BUNDLE_PATH" "host/public/bundle.js"
ln -sf "$MAP_PATH"    "host/public/bundle.js.map"