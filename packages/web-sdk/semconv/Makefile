# Generates ../src/semconv/ from the embrace-semconv registry with weaver and validates the result
# with the SDK package's own checks. The same targets run locally and in CI; `make help` lists
# them. Requires GNU make 3.81 or later (macOS ships 3.81), so every multi-line recipe runs in a
# single shell via backslash continuations.
SHELL := /usr/bin/env bash

# The weaver version is pinned in versions.env, which CI reads too.
include versions.env

# The repo root's .github/actions, whose setup-weaver install script is shared with CI.
ACTIONS_DIR := $(or $(shell git rev-parse --show-toplevel 2>/dev/null),.)/.github/actions

# The registry the code is generated from, pinned to a release. The templates' filter chooses
# which of its keys are generated (templates/registry/typescript/weaver.yaml).
SOURCE_REGISTRY := https://github.com/embrace-io/embrace-semconv@v0.3.0[model]

# The templates directory, and the target under $(TEMPLATES)/registry/ to generate with.
TEMPLATES := templates
CODEGEN_TARGET := typescript

# Where the generated code is written. It is emptied on every run, so it must hold only generated
# files.
GENERATED_DIR := ../src/semconv

.PHONY: all generate validate-generated install-weaver require-weaver require-jq help

all: validate-generated

# Regenerate $(GENERATED_DIR)/ from $(SOURCE_REGISTRY). Needs network access. This is the generated
# code's only generator: CI fails when the committed code doesn't match what this generates.
generate: require-weaver require-jq
	rm -rf $(GENERATED_DIR)
	bash -c "$$RUN_WEAVER" run-weaver registry generate -r "$(SOURCE_REGISTRY)" --v2 \
	  --templates $(TEMPLATES) $(CODEGEN_TARGET) $(GENERATED_DIR)

# Prove the generated code is valid TypeScript for the SDK with the package's own `check` script
# (tsc over src/, which includes the generated code, then eslint). npm enforces the repo's
# devEngines, so run this with the Node version package.json requires.
validate-generated: generate
	cd .. && npm run check

# Install the weaver version pinned in versions.env into ~/.local/bin.
install-weaver:
	WEAVER_VERSION=$(WEAVER_VERSION) bash "$(ACTIONS_DIR)/setup-weaver/install-weaver.sh"

# Fail if weaver is not on PATH; warn if it is not the version pinned in versions.env.
require-weaver:
	@command -v weaver >/dev/null 2>&1 || { \
	  echo "error: weaver not found on PATH. Run 'make install-weaver' to install the pinned" >&2; \
	  echo "version, or put a release binary from" >&2; \
	  echo "https://github.com/open-telemetry/weaver/releases on PATH." >&2; \
	  exit 1; \
	}
	@installed="$$(weaver --version | awk '{print $$2}')"; \
	if [[ "$$installed" != "$(WEAVER_VERSION:v%=%)" ]]; then \
	  echo "warning: weaver $$installed installed, but this project pins" >&2; \
	  echo "$(WEAVER_VERSION:v%=%) (see versions.env)." >&2; \
	fi

# Fail if jq is not on PATH. GitHub's runners have it preinstalled.
require-jq:
	@command -v jq >/dev/null 2>&1 || { \
	  echo "error: jq not found on PATH. Install it from https://jqlang.org/download/." >&2; \
	  exit 1; \
	}

help:
	@echo "generate               regenerate $(GENERATED_DIR)/ from $(SOURCE_REGISTRY)"
	@echo "validate-generated     regenerate, then type-check and lint the SDK package"
	@echo "install-weaver         install the weaver version pinned in versions.env"

# Bash script that runs weaver, as `bash -c "$$RUN_WEAVER" run-weaver <weaver arguments>`. It asks
# weaver for JSON diagnostics and prints them one per line, collapsing the "definition/2 is not
# yet stable" warning weaver emits for every such file, the dependencies' included (33 of them for
# the pinned registry), and exits with weaver's status.
define RUN_WEAVER
set -e
out="$$(mktemp)"
trap 'rm -f "$$out"' EXIT
status=0
weaver "$$@" --diagnostic-format json --diagnostic-stdout=true > "$$out" || status=$$?
if ! jq -e 'type == "array"' "$$out" > /dev/null 2>&1; then
  if [[ $$status -ne 0 ]]; then exit $$status; fi
  echo "error: weaver's diagnostics are not a JSON array." >&2
  exit 1
fi
jq -r "$$PRINT_DIAGNOSTICS" "$$out" >&2
exit $$status
endef
export RUN_WEAVER

# jq program for RUN_WEAVER.
define PRINT_DIAGNOSTICS
def unstable: [.error | objects | .FailToResolveDefinition? | objects | .UnstableFileFormat?
  | select(. != null)] | length > 0;
([.[] | select(unstable)] | length) as $$unstable
| [.[] | select(unstable | not)
    | if (.error | objects | .type?) == "policy_violation"
      then "Policy \(.error.violation.level) [\(.error.violation.id)]: \(.error.violation.message)"
      else "\(.diagnostic.severity // "Error"): \(.diagnostic.message)"
        + (if .diagnostic.help then "\n  help: \(.diagnostic.help)" else "" end)
      end]
  + (if $$unstable > 0
     then ["Warning: \($$unstable) definition files, the dependencies' included, use file_format "
           + "definition/2, which weaver still reports as not yet stable."]
     else [] end)
| .[]
endef
export PRINT_DIAGNOSTICS
