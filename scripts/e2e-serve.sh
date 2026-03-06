#!/usr/bin/env bash
# Start a long-running container with all Next.js servers pre-started.
# Requires the SDK and platforms to be already built first.
set -euo pipefail

# shellcheck source=e2e-container-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/e2e-container-env.sh"

podman rm "${SERVE_CONTAINER}" 2>/dev/null || true
podman run -d \
  --name "${SERVE_CONTAINER}" \
  "${PODMAN_BASE_FLAGS[@]}" \
  -w /workspace \
  "${PLAYWRIGHT_IMAGE}" \
  bash /workspace/scripts/test-integration-serve-startup.sh

echo "Waiting for all servers to be ready (may take a few minutes on first run)..."
timeout 300 bash -c "until podman logs ${SERVE_CONTAINER} 2>&1 | grep -q 'All servers ready'; do sleep 2; done"
echo "Servers are up. Run tests with: npm run test:integration:container:test"
