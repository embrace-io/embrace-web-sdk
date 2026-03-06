#!/usr/bin/env bash
# Remove the integration container image, forcing a full rebuild on next run.
set -euo pipefail

# shellcheck source=e2e-container-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/e2e-container-env.sh"

podman rmi "${IMAGE_TAG}" 2>/dev/null || true
echo "Done. Image will be rebuilt on next run."
