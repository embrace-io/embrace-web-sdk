#!/usr/bin/env bash
# Remove the Linux node_modules volume, forcing a fresh npm ci on next run.
set -euo pipefail

# shellcheck source=e2e-container-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/e2e-container-env.sh"

podman volume rm "${NODE_MODULES_VOLUME}" 2>/dev/null || true
echo "Done. Dependencies will be reinstalled on next run."
