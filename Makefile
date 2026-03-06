PLAYWRIGHT_IMAGE    := mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d
WORKSPACE           := $(shell pwd)
NODE_MODULES_VOLUME := embrace-web-sdk-integration-node-modules
SERVE_CONTAINER     := embrace-integration-servers
UPDATE_GOLDEN       ?= 0

# Auto-detect the host architecture to avoid QEMU emulation on Apple Silicon.
# Override with: make start_e2e_servers PLATFORM=linux/amd64
HOST_ARCH := $(shell uname -m)
ifeq ($(filter arm64 aarch64,$(HOST_ARCH)),)
  PLATFORM ?= linux/amd64
else
  PLATFORM ?= linux/arm64
endif

PODMAN_BASE_FLAGS := \
  --platform $(PLATFORM) \
  -v $(WORKSPACE):/workspace \
  -v $(NODE_MODULES_VOLUME):/workspace/node_modules \
  -e HOME=/root \
  -e UPDATE_GOLDEN=$(UPDATE_GOLDEN)

.PHONY: run_e2e_in_container start_e2e_servers run_e2e_in_container_fast \
        stop_e2e_servers reset_container_dependencies

## Full CI-equivalent run: build SDK + platforms, then run all tests.
run_e2e_in_container:
	bash scripts/test-integration-podman.sh

## Start a long-running container with all Next.js servers pre-started.
## Requires the SDK and platforms to be already built (run run_e2e_in_container once first).
start_e2e_servers:
	-podman rm $(SERVE_CONTAINER) 2>/dev/null
	podman run -d \
	  --name $(SERVE_CONTAINER) \
	  $(PODMAN_BASE_FLAGS) \
	  -w /workspace \
	  $(PLAYWRIGHT_IMAGE) \
	  bash /workspace/scripts/test-integration-serve-startup.sh
	@echo "Waiting for all servers to be ready (may take a few minutes on first run)..."
	@timeout 300 bash -c "until podman logs $(SERVE_CONTAINER) 2>&1 | grep -q 'All servers ready'; do sleep 2; done"
	@echo "Servers are up. Run tests with: make run_e2e_in_container_fast"

## Run Playwright tests in a fresh container sharing the serve container's network (fast, no rebuild).
run_e2e_in_container_fast:
	@podman ps -q --filter name=$(SERVE_CONTAINER) | grep -q . || \
	  (echo "Error: serve container is not running. Start it with: make start_e2e_servers" && exit 1)
	podman run --rm \
	  --network container:$(SERVE_CONTAINER) \
	  $(PODMAN_BASE_FLAGS) \
	  -w /workspace/tests/integration \
	  $(PLAYWRIGHT_IMAGE) \
	  bash -c "mkdir -p /root/.cache && ln -sf /ms-playwright /root/.cache/ms-playwright && npx playwright test --config playwright.config.prebuilt.ts"

## Stop and remove the serve container.
stop_e2e_servers:
	-podman stop $(SERVE_CONTAINER)
	-podman rm   $(SERVE_CONTAINER)

## Clear the container node_modules volume (forces a fresh npm ci on next run).
reset_container_dependencies:
	-podman volume rm $(NODE_MODULES_VOLUME)
