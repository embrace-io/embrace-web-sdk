#!/usr/bin/env bash
# Remove the integration container image, forcing a full rebuild on next run.
set -euo pipefail

# shellcheck source=e2e-container-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/e2e-container-env.sh"

if podman image exists "${IMAGE_TAG}" 2>/dev/null; then
  if ! podman rmi "${IMAGE_TAG}"; then
    echo "Error: failed to remove image '${IMAGE_TAG}'. Is a container still using it?" >&2
    echo "Try: podman rm -f ${SERVE_CONTAINER}" >&2
    exit 1
  fi
fi
echo "Done. Image will be rebuilt on next run."
