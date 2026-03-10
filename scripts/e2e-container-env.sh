# Shared environment variables for e2e container scripts.
# Source this file; do not execute it directly.
#
#   source "$(dirname "${BASH_SOURCE[0]}")/e2e-container-env.sh"

PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d"
WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_MODULES_VOLUME="embrace-web-sdk-integration-node-modules"
SERVE_CONTAINER="embrace-integration-servers"
UPDATE_GOLDEN="${UPDATE_GOLDEN:-0}"

# Auto-detect the host architecture to avoid QEMU emulation on Apple Silicon.
# Override with: PLATFORM=linux/amd64 <script>
HOST_ARCH="$(uname -m)"
if [[ "${HOST_ARCH}" == "arm64" || "${HOST_ARCH}" == "aarch64" ]]; then
  PLATFORM="${PLATFORM:-linux/arm64}"
else
  PLATFORM="${PLATFORM:-linux/amd64}"
fi

PODMAN_BASE_FLAGS=(
  --platform "${PLATFORM}"
  -v "${WORKSPACE}:/workspace"
  -v "${NODE_MODULES_VOLUME}:/workspace/node_modules"
  -e HOME=/root
)
