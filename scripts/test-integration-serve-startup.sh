#!/usr/bin/env bash
# Runs INSIDE the container. Starts all integration servers, waits for them to
# be ready, then idles so the container stays alive for repeated test runs.
set -euo pipefail

cd /workspace

wait_for_url() {
  local url=$1
  local retries=60
  until curl -sf "$url" > /dev/null 2>&1; do
    if [ "$retries" -le 0 ]; then
      echo "Timeout waiting for $url"
      exit 1
    fi
    sleep 2
    retries=$((retries - 1))
  done
}

echo "--- Starting servers ---"
npm run server --prefix /workspace &
(cd /workspace/tests/integration/platforms/next-15-turbopack-app  && npx next start -p 3010) &
(cd /workspace/tests/integration/platforms/next-15-turbopack-pages && npx next start -p 3011) &
(cd /workspace/tests/integration/platforms/next-15-webpack-app    && npx next start -p 3012) &
(cd /workspace/tests/integration/platforms/next-15-webpack-pages  && npx next start -p 3013) &
(cd /workspace/tests/integration/platforms/next-16-app            && npx next start -p 3014) &
(cd /workspace/tests/integration/platforms/next-16-pages          && npx next start -p 3015) &

echo "--- Waiting for servers ---"
wait_for_url http://localhost:3001/health-check
wait_for_url http://localhost:3010
wait_for_url http://localhost:3011
wait_for_url http://localhost:3012
wait_for_url http://localhost:3013
wait_for_url http://localhost:3014
wait_for_url http://localhost:3015

echo "--- All servers ready ---"
sleep infinity
