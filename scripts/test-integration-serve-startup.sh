#!/usr/bin/env bash
# Runs INSIDE the container. Starts all integration servers, waits for them to
# be ready, then idles so the container stays alive for repeated test runs.
set -euo pipefail

cd /workspace

wait_for_url() {
  local url=$1
  local logfile=${2:-}
  local retries=60
  until curl -sf "$url" > /dev/null 2>&1; do
    if [ "$retries" -le 0 ]; then
      echo "Timeout waiting for $url"
      [[ -n "$logfile" ]] && tail -20 "$logfile"
      exit 1
    fi
    sleep 2
    retries=$((retries - 1))
  done
}

echo "--- Starting servers ---"
npm run server --prefix /workspace                                                           > /tmp/server-api.log  2>&1 &
(cd /workspace/tests/integration/platforms/next-15-turbopack-app  && npx next start -p 3010) > /tmp/server-3010.log 2>&1 &
(cd /workspace/tests/integration/platforms/next-15-turbopack-pages && npx next start -p 3011) > /tmp/server-3011.log 2>&1 &
(cd /workspace/tests/integration/platforms/next-15-webpack-app    && npx next start -p 3012) > /tmp/server-3012.log 2>&1 &
(cd /workspace/tests/integration/platforms/next-15-webpack-pages  && npx next start -p 3013) > /tmp/server-3013.log 2>&1 &
(cd /workspace/tests/integration/platforms/next-16-app            && npx next start -p 3014) > /tmp/server-3014.log 2>&1 &
(cd /workspace/tests/integration/platforms/next-16-pages          && npx next start -p 3015) > /tmp/server-3015.log 2>&1 &

echo "--- Waiting for servers ---"
wait_for_url http://localhost:3001/health-check /tmp/server-api.log
wait_for_url http://localhost:3010 /tmp/server-3010.log
wait_for_url http://localhost:3011 /tmp/server-3011.log
wait_for_url http://localhost:3012 /tmp/server-3012.log
wait_for_url http://localhost:3013 /tmp/server-3013.log
wait_for_url http://localhost:3014 /tmp/server-3014.log
wait_for_url http://localhost:3015 /tmp/server-3015.log

echo "--- All servers ready ---"
sleep infinity
