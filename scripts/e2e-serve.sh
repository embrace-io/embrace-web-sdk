#!/usr/bin/env bash
# Start a long-running container with all integration servers.
# The image is built from source; no pre-build required.
set -euo pipefail

# shellcheck source=e2e-container-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/e2e-container-env.sh"

if ! podman image exists "${IMAGE_TAG}" 2>/dev/null; then
  echo "Error: integration image '${IMAGE_TAG}' not found." >&2
  echo "Build it first with: bash scripts/test-integration-podman.sh" >&2
  exit 1
fi

podman rm -f "${SERVE_CONTAINER}" 2>/dev/null || true
podman run -d \
  --name "${SERVE_CONTAINER}" \
  "${PODMAN_BASE_FLAGS[@]}" \
  -w /workspace \
  "${IMAGE_TAG}" \
  bash /workspace/scripts/test-integration-serve-startup.sh

echo "Waiting for all servers to be ready (may take a few minutes on first run)..."
if ! timeout 300 bash -c "
  until podman logs \$1 2>&1 | grep -q 'All servers ready'; do
    if ! podman ps -q --filter name=\$1 | grep -q .; then
      echo 'Error: container exited unexpectedly' >&2
      exit 1
    fi
    sleep 2
  done
" _ "${SERVE_CONTAINER}"; then
  echo "Error: servers did not become ready within 5 minutes. Last 50 lines of logs:" >&2
  podman logs --tail 50 "${SERVE_CONTAINER}" >&2
  exit 124
fi
echo "Servers are up. Run tests with: npm run test:integration:container:test"
