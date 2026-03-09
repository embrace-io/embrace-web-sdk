# Shared environment variables for e2e container scripts.
# Source this file; do not execute it directly.
#
#   source "$(dirname "${BASH_SOURCE[0]}")/e2e-container-env.sh"

PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d"
WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVE_CONTAINER="embrace-integration-servers"
IMAGE_TAG="embrace-web-sdk-integration"
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
  -e HOME=/root
)

build_integration_image() {
  echo "Building integration image (${IMAGE_TAG})..."
  if ! podman build --platform "${PLATFORM}" \
    -t "${IMAGE_TAG}" \
    -f - "${WORKSPACE}" <<DOCKERFILE
FROM ${PLAYWRIGHT_IMAGE}
WORKDIR /workspace
COPY . .
RUN mkdir -p /root/.cache && ln -sf /ms-playwright /root/.cache/ms-playwright
RUN npm i -g npm@11 && npm ci
RUN npm run build
RUN npm run install-dependencies --prefix tests/integration
RUN npm run build-platforms --prefix tests/integration
DOCKERFILE
  then
    echo "Error: failed to build integration image '${IMAGE_TAG}'" >&2
    return 1
  fi
}

run_with_golden_copy() {
  local cmd="$1"
  shift
  if [[ "${UPDATE_GOLDEN}" == "1" ]]; then
    local CONTAINER_ID
    CONTAINER_ID=$(podman create "${PODMAN_BASE_FLAGS[@]}" "$@" "${IMAGE_TAG}" bash -c "${cmd}")
    podman start -a "${CONTAINER_ID}" && TEST_EXIT=0 || TEST_EXIT=$?
    if ! podman cp "${CONTAINER_ID}:/workspace/tests/integration/tests/__golden__/." \
         "${WORKSPACE}/tests/integration/tests/__golden__/"; then
      echo "Warning: failed to copy golden files from container" >&2
    fi
    podman rm "${CONTAINER_ID}" 2>/dev/null || true
    return "${TEST_EXIT}"
  else
    podman run --rm "${PODMAN_BASE_FLAGS[@]}" "$@" "${IMAGE_TAG}" bash -c "${cmd}"
  fi
}
