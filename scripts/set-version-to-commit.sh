#!/usr/bin/env bash
# This util stamps every version string in the repo with the current HEAD
# commit.
# Used while testing a branch so emitted SDK telemetry carries the build's SHA.
# Delegates to validate-versions.js, which updates package.json, SDK_VERSION /
# CLI_VERSION constants, golden files, and lockfile in one pass.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

SHA="$(git rev-parse --short=8 HEAD)"
VERSION="0.0.0-${SHA}"

echo "Stamping repo with version ${VERSION} (HEAD = ${SHA})"
node scripts/validate-versions.js --fix --version "${VERSION}"
npm install
