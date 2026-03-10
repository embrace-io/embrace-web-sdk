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

podman run --rm \
  --network "container:${SERVE_CONTAINER}" \
  "${PODMAN_BASE_FLAGS[@]}" \
  -e "UPDATE_GOLDEN=${UPDATE_GOLDEN}" \
  -w /workspace/tests/integration \
  "${PLAYWRIGHT_IMAGE}" \
  bash -c "
    set -e
    mkdir -p /root/.cache && ln -sf /ms-playwright /root/.cache/ms-playwright
    npm install -g npm@\$(node -e \"process.stdout.write(require('/workspace/package.json').packageManager.split('@')[1])\")
    if [ '${UPDATE_GOLDEN}' = '1' ]; then
      UPDATE_GOLDEN=1 npx playwright test --config playwright.config.prebuilt.ts
    else
      npx playwright test --config playwright.config.prebuilt.ts
    fi
  " &
PODMAN_PID=$!
trap 'kill "${PODMAN_PID}" 2>/dev/null' INT TERM
wait "${PODMAN_PID}"
