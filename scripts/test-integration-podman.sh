#!/usr/bin/env bash
# Runs integration tests inside the same container used in CI.
# This ensures golden file comparisons are consistent between local and CI.
#
# Usage:
#   ./scripts/test-integration-podman.sh                  # Run tests
#   UPDATE_GOLDEN=1 ./scripts/test-integration-podman.sh  # Regenerate golden files
#
# On Apple Silicon the script defaults to linux/arm64 (native, no QEMU).
# On Intel Macs it defaults to linux/amd64 to match CI.
# Override with PLATFORM=linux/amd64 if you want to force amd64 emulation (requires QEMU, may be unstable):
#   PLATFORM=linux/amd64 ./scripts/test-integration-podman.sh

set -euo pipefail

# shellcheck source=e2e-container-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/e2e-container-env.sh"

echo "Image:     ${PLAYWRIGHT_IMAGE}"
echo "Workspace: ${WORKSPACE}"
echo "Platform:  ${PLATFORM}"
if [[ "${UPDATE_GOLDEN}" == "1" ]]; then
  echo "Mode:      UPDATE GOLDEN FILES"
fi

build_integration_image

run_with_golden_copy "npm run test:integration" \
  -w /workspace
