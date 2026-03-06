#!/usr/bin/env bash
# Stop and remove the e2e serve container.
set -euo pipefail

# shellcheck source=e2e-container-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/e2e-container-env.sh"

podman stop "${SERVE_CONTAINER}" 2>/dev/null || true
podman rm   "${SERVE_CONTAINER}" 2>/dev/null || true
