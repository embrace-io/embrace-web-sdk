#!/usr/bin/env bash
# Run Playwright tests in a fresh container sharing the serve container's network.
# Requires the serve container to be running (npm run test:integration:container:serve).
set -euo pipefail

# shellcheck source=e2e-container-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/e2e-container-env.sh"

if ! podman ps -q --filter "name=${SERVE_CONTAINER}" | grep -q .; then
  echo "Error: serve container is not running. Start it with: npm run test:integration:container:serve"
  exit 1
fi

run_with_golden_copy "npx playwright test --config playwright.config.prebuilt.ts" \
  --network "container:${SERVE_CONTAINER}" \
  -w /workspace/tests/integration
