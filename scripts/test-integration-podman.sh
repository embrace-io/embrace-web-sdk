#!/usr/bin/env bash
# Runs integration tests inside the same container used in CI.
# This ensures golden file comparisons are consistent between local and CI.
#
# Usage:
#   ./scripts/test-integration-podman.sh                  # Run tests
#   UPDATE_GOLDEN=1 ./scripts/test-integration-podman.sh  # Regenerate golden files
#   ./scripts/test-integration-podman.sh --reset-deps     # Clear the Linux node_modules volume and reinstall
#
# On Apple Silicon the script defaults to linux/arm64 (native, no QEMU).
# On Intel Macs it defaults to linux/amd64 to match CI.
# Override with ARCH=linux/amd64 if you want to force amd64 emulation (requires QEMU, may be unstable):
#   ARCH=linux/amd64 ./scripts/test-integration-podman.sh

set -euo pipefail

PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d"
WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_MODULES_VOLUME="embrace-web-sdk-integration-node-modules"
HOST_ARCH="$(uname -m)"
if [[ "${HOST_ARCH}" == "arm64" || "${HOST_ARCH}" == "aarch64" ]]; then
  PLATFORM="${ARCH:-linux/arm64}"
else
  PLATFORM="${ARCH:-linux/amd64}"
fi
UPDATE_GOLDEN="${UPDATE_GOLDEN:-0}"

if [[ "${1:-}" == "--reset-deps" ]]; then
  echo "Removing Linux node_modules volume '${NODE_MODULES_VOLUME}'..."
  podman volume rm "${NODE_MODULES_VOLUME}" 2>/dev/null || true
  echo "Done. Dependencies will be reinstalled on next run."
  exit 0
fi

echo "Image:     ${PLAYWRIGHT_IMAGE}"
echo "Workspace: ${WORKSPACE}"
echo "Platform:  ${PLATFORM}"
if [[ "${UPDATE_GOLDEN}" == "1" ]]; then
  echo "Mode:      UPDATE GOLDEN FILES"
fi

podman run --rm \
  --platform "${PLATFORM}" \
  -v "${WORKSPACE}:/workspace" \
  -v "${NODE_MODULES_VOLUME}:/workspace/node_modules" \
  -w /workspace \
  -e HOME=/root \
  -e UPDATE_GOLDEN="${UPDATE_GOLDEN}" \
  "${PLAYWRIGHT_IMAGE}" \
  bash -c "
    set -e
    # Mirror the CI container setup: link pre-installed browsers to the expected cache path
    mkdir -p /root/.cache
    ln -sf /ms-playwright /root/.cache/ms-playwright

    # Upgrade npm to the version required by devEngines.packageManager
    echo '--- npm install -g npm ---'
    npm install -g npm@\$(node -e \"process.stdout.write(require('/workspace/package.json').packageManager.split('@')[1])\")

    # Install dependencies (Linux-compatible binaries go into the named volume)
    echo '--- npm ci ---'
    npm ci

    # Run integration tests
    if [ '${UPDATE_GOLDEN}' = '1' ]; then
      echo '--- npm run test:integration:update-golden ---'
      npm run test:integration:update-golden
    else
      echo '--- npm run test:integration ---'
      npm run test:integration
    fi
  " &
PODMAN_PID=$!
trap 'kill "${PODMAN_PID}" 2>/dev/null' INT TERM
wait "${PODMAN_PID}"
