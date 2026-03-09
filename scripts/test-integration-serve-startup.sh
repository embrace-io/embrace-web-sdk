#!/usr/bin/env bash
# Runs INSIDE the container. Starts all integration servers, waits for them to
# be ready, then idles so the container stays alive for repeated test runs.
set -e

mkdir -p /root/.cache
ln -sf /ms-playwright /root/.cache/ms-playwright

echo "--- npm install -g npm ---"
npm install -g npm@$(node -e "process.stdout.write(require('/workspace/package.json').packageManager.split('@')[1])")

echo "--- npm ci ---"
cd /workspace && npm ci

wait_for_url() {
  local url=$1
  local retries=60
  until curl -sf "$url" > /dev/null 2>&1; do
    [ "$retries" -le 0 ] && { echo "Timeout waiting for $url"; exit 1; }
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
wait_for_url http://localhost:3001/health-check
wait_for_url http://localhost:3010
wait_for_url http://localhost:3011
wait_for_url http://localhost:3012
wait_for_url http://localhost:3013
wait_for_url http://localhost:3014
wait_for_url http://localhost:3015

echo "--- All servers ready ---"
sleep infinity
