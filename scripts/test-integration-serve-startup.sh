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
SERVER_PIDS=($!)
(cd /workspace/tests/integration/platforms/next-15-turbopack-app  && npx next start -p 3010) &
SERVER_PIDS+=($!)
(cd /workspace/tests/integration/platforms/next-15-turbopack-pages && npx next start -p 3011) &
SERVER_PIDS+=($!)
(cd /workspace/tests/integration/platforms/next-15-webpack-app    && npx next start -p 3012) &
SERVER_PIDS+=($!)
(cd /workspace/tests/integration/platforms/next-15-webpack-pages  && npx next start -p 3013) &
SERVER_PIDS+=($!)
(cd /workspace/tests/integration/platforms/next-16-app            && npx next start -p 3014) &
SERVER_PIDS+=($!)
(cd /workspace/tests/integration/platforms/next-16-pages          && npx next start -p 3015) &
SERVER_PIDS+=($!)

sleep 2
for pid in "${SERVER_PIDS[@]}"; do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "Error: server process $pid crashed on startup" >&2
    exit 1
  fi
done

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
