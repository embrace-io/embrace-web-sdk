# Validation, generation and packaging for this project. The same targets run locally and in CI;
# `make help` lists them.
#
# Built from the otel-semconv-setup canonical layout. Each part is a section
# from a `# ==== <name>` line (optionally followed by `: <description>`) to its
# `# ==== end <name>` line. Every project keeps `project`, `common` and `templates`, plus the
# sections of the features and collections it uses. Within a section, change only the settings at
# its top (a project may add settings of its own there, and reword a setting's comment to match
# its value); keep the targets in sync with the layout. Requires GNU make 3.81 or later (macOS
# ships 3.81), so every multi-line recipe runs in a single shell via backslash continuations.

# ==== project
.PHONY: all

# Default: validate, then regenerate everything this project owns.
all: validate-generated
# ==== end project

# ==== common: tool pins and installation, the weaver runner
SHELL := /usr/bin/env bash

# The tool versions (and, with the registry section, the shared policy pack) are pinned in
# versions.env.
include versions.env

# Where the setup-* actions live: the repo root's .github/actions, found through git, so a project
# in a subdirectory of its repo needs no setting here. Their install scripts are shared with CI.
# Outside a git checkout it falls back to this directory's .github/actions. Set it by hand when
# the actions live elsewhere (a project inside a git submodule, say).
ACTIONS_DIR := $(or $(shell git rev-parse --show-toplevel 2>/dev/null),.)/.github/actions

# Extra flags for every weaver run, split on spaces. A registry that depends on, or compares with,
# a registry in a private repository needs --allow-git-credentials: without it, weaver's git
# operations can't use the machine's git credentials.
WEAVER_FLAGS :=
export WEAVER_FLAGS

.PHONY: test generate-all install-weaver require-weaver require-jq clean help

# Every test suite this project owns; each section adds its own. Used locally only, as CI runs the
# suites as separate jobs.
test::
	@:

# Every regeneration this project owns; each section adds its own. CI fails when the committed
# output doesn't match what this generates.
generate-all::
	@:

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

# Remove build output only. Generated output that is committed is left alone.
clean:
	rm -rf .build

help::
	@echo "test                   run every test suite"
	@echo "generate-all           run every regeneration this project owns"
	@echo "install-weaver         install the weaver version pinned in versions.env"
	@echo "clean                  remove build output"

# Bash script every section runs weaver through, as `bash -c "$$RUN_WEAVER" run-weaver <name>
# <weaver arguments>`. It adds WEAVER_FLAGS, asks weaver for JSON diagnostics, keeps them in
# .build/<name>.json, prints them unwrapped (weaver wraps its text output to the terminal width,
# which breaks anything that reads it), and fails when weaver does or when any import matches
# nothing. Weaver only warns about the latter, and an import that matches nothing silently drops
# what the registry meant to include.
#
# When RUN_WEAVER_KNOWN_VIOLATIONS names a file (validate-registry sets it from KNOWN_VIOLATIONS),
# the policy violations it lists are accepted: weaver's failure is overridden when every failure is
# one of them, and a listed violation that no longer occurs is an error, so the list only shrinks.
define RUN_WEAVER
set -e
name="$$1"
shift
mkdir -p .build
out=".build/$$name.json"
status=0
# WEAVER_FLAGS holds zero or more flags, so it is split on spaces on purpose.
weaver "$$@" $$WEAVER_FLAGS --diagnostic-format json --diagnostic-stdout=true > "$$out" \
  || status=$$?
if ! jq -e 'type == "array"' "$$out" > /dev/null 2>&1; then
  if [[ $$status -ne 0 ]]; then exit $$status; fi
  echo "error: weaver's diagnostics in $$out are not a JSON array." >&2
  exit 1
fi
known_file="$${RUN_WEAVER_KNOWN_VIOLATIONS:-}"
known='[]'
if [[ -n "$$known_file" ]]; then
  if ! jq -e 'type == "array"' "$$known_file" > /dev/null 2>&1; then
    echo "error: $$known_file must be a JSON array of known policy violations." >&2
    exit 1
  fi
  known="$$(< "$$known_file")"
fi
jq -r --argjson known "$$known" --arg known_file "$$known_file" \
  "$$DIAGNOSTIC_DEFS $$PRINT_DIAGNOSTICS" "$$out" >&2
if [[ $$status -ne 0 ]]; then
  unknown="$$(jq --argjson known "$$known" "$$DIAGNOSTIC_DEFS $$UNKNOWN_FAILURES" "$$out")"
  if [[ -z "$$known_file" || "$$unknown" != 0 ]]; then exit $$status; fi
fi
if [[ -n "$$known_file" ]]; then
  stale="$$(jq -r --argjson known "$$known" "$$DIAGNOSTIC_DEFS $$STALE_KNOWN_VIOLATIONS" "$$out")"
  if [[ -n "$$stale" ]]; then
    echo "error: known violations in $$known_file that no longer occur:" >&2
    echo "$$stale" >&2
    echo "Remove them from $$known_file." >&2
    exit 1
  fi
fi
unmatched="$$(jq -r "$$UNMATCHED_IMPORTS" "$$out")"
if [[ -n "$$unmatched" ]]; then
  echo "error: imports that match nothing in any dependency:" >&2
  echo "$$unmatched" >&2
  echo "Each import must match something a direct dependency exports." >&2
  exit 1
fi
endef
export RUN_WEAVER

# jq definitions the programs below share, for weaver's JSON diagnostics. A failure is a policy
# violation at level `violation` or any other diagnostic of severity Error; a known violation is a
# policy violation whose id and context match an entry of $$known.
define DIAGNOSTIC_DEFS
def policy: (.error | objects | .type?) == "policy_violation";
def unstable: [.error | objects | .FailToResolveDefinition? | objects | .UnstableFileFormat?
  | select(. != null)] | length > 0;
def failure: if policy then .error.violation.level == "violation"
  else (.diagnostic.severity // "Error") == "Error" end;
def known: policy and (.error.violation as $$v
  | $$known | any(.id == $$v.id and .context == $$v.context));
endef
export DIAGNOSTIC_DEFS

# jq program for RUN_WEAVER: one line per diagnostic. Policy findings print their id and message;
# known violations collapse to one line, and so does the "definition/2 is not yet stable" warning
# weaver emits for every such file, the dependencies' included.
define PRINT_DIAGNOSTICS
([.[] | select(unstable)] | length) as $$unstable
| ([.[] | select(known)] | length) as $$accepted
| [.[] | select((unstable or known) | not)
    | if policy
      then "Policy \(.error.violation.level) [\(.error.violation.id)]: \(.error.violation.message)"
      else "\(.diagnostic.severity // "Error"): \(.diagnostic.message)"
        + (if .diagnostic.help then "\n  help: \(.diagnostic.help)" else "" end)
      end]
  + (if $$accepted > 0
     then ["Accepted \($$accepted) known policy violations listed in \($$known_file)."]
     else [] end)
  + (if $$unstable > 0
     then ["Warning: \($$unstable) definition files, the dependencies' included, use file_format "
           + "definition/2, which weaver still reports as not yet stable."]
     else [] end)
| .[]
endef
export PRINT_DIAGNOSTICS

# jq program for RUN_WEAVER: how many failures are not known violations.
define UNKNOWN_FAILURES
[.[] | select(failure and (known | not))] | length
endef
export UNKNOWN_FAILURES

# jq program for RUN_WEAVER: one line per known violation that weaver no longer reports.
define STALE_KNOWN_VIOLATIONS
[.[] | select(policy) | .error.violation | {id, context}] as $$found
| $$known[] | select(. as $$k | $$found | any(.id == $$k.id and .context == $$k.context) | not)
| "  \(.id) \(.context | tojson)"
endef
export STALE_KNOWN_VIOLATIONS

# jq program for RUN_WEAVER: one line per import that matched nothing.
define UNMATCHED_IMPORTS
.[] | .error | objects | .UnmatchedImport // empty | "  \(.signal): \(.pattern)"
endef
export UNMATCHED_IMPORTS
# ==== end common

# ==== templates: the template regression test
# The directory holding the templates, one subdirectory per target under registry/.
TEMPLATES := templates

# The template targets to test, i.e. the directories under $(TEMPLATES)/registry/. Set with `=`,
# not `:=`, so that with the codegen section it can name $(CODEGEN_TARGET), set further down.
TEMPLATE_TARGETS = $(CODEGEN_TARGET)

# The fixture registry the templates are rendered from. It is never published. It imports from a
# dependency so the provenance filters in the templates have something to filter out.
FIXTURE := templates_test/fixture

# The expected output, one subdirectory per template target.
GOLDEN := templates_test/golden

.PHONY: test-templates update-golden

# Render every template target from the fixture and compare with the golden files, so any change
# in template output (including definitions from a dependency leaking in) shows up as a diff. Run
# `make update-golden` after a deliberate change to the templates' output.
test-templates: require-weaver require-jq
	@set -e; \
	if [[ -z "$(strip $(TEMPLATE_TARGETS))" ]]; then \
	  echo "error: TEMPLATE_TARGETS is empty, so there is nothing to test." >&2; \
	  exit 1; \
	fi; \
	rm -rf .build/test-templates; \
	for target in $(TEMPLATE_TARGETS); do \
	  bash -c "$$RUN_WEAVER" run-weaver "test-templates-$$target" registry generate \
	    -r $(FIXTURE) --v2 --templates $(TEMPLATES) "$$target" ".build/test-templates/$$target"; \
	done
	@if ! git --no-pager diff --no-index --exit-code $(GOLDEN) .build/test-templates; then \
	  echo "" >&2; \
	  echo "error: the output rendered from the fixture does not match $(GOLDEN)/." >&2; \
	  echo "If the change is intended, refresh the golden files with:" >&2; \
	  echo "    make update-golden" >&2; \
	  exit 1; \
	fi
	@echo "templates OK: the fixture's output matches $(GOLDEN)/"

test:: test-templates
	@:

# Refresh the golden files after a template change that intentionally alters the output, then
# review the diff under $(GOLDEN)/ before committing it.
update-golden: require-weaver require-jq
	@set -e; \
	if [[ -z "$(strip $(TEMPLATE_TARGETS))" ]]; then \
	  echo "error: TEMPLATE_TARGETS is empty, so there is nothing to render." >&2; \
	  exit 1; \
	fi; \
	rm -rf $(GOLDEN); \
	for target in $(TEMPLATE_TARGETS); do \
	  bash -c "$$RUN_WEAVER" run-weaver "update-golden-$$target" registry generate \
	    -r $(FIXTURE) --v2 --templates $(TEMPLATES) "$$target" "$(GOLDEN)/$$target"; \
	done

help::
	@echo "test-templates         compare the templates' output from the fixture with the golden files"
	@echo "update-golden          refresh the golden files after an intended template change"
# ==== end templates

# ==== codegen: TypeScript source code generated from a registry with this project's templates
# The registry the code is generated from: the embrace-semconv registry, pinned to a release. The
# `# renovate:` line lets Renovate bump the release; the templates' filter chooses which of its
# keys are generated (templates/registry/typescript/weaver.yaml).
# renovate: datasource=github-tags depName=embrace-io/embrace-semconv versioning=semver-coerced
SOURCE_REGISTRY := https://github.com/embrace-io/embrace-semconv@v0.3.0[model]

# The template target under $(TEMPLATES)/registry/ to generate with.
CODEGEN_TARGET := typescript

# Where the generated code is written: a directory of the SDK's sources. It is emptied on every
# run, so it must hold only generated files: render any hand-written file that has to live there
# from a template of its own.
GENERATED_DIR := ../src/semconv

.PHONY: generate validate-generated package-generated

# Regenerate $(GENERATED_DIR)/ from $(SOURCE_REGISTRY). Needs network access for remote registries
# and dependencies. If the generated code is committed, this is its only generator, and CI fails
# when the committed code doesn't match what this generates. If a build tool generates the code at
# build time instead, it stays the generator: GENERATED_DIR then points under .build/, and
# validate-generated compares this output with the build tool's.
generate: require-weaver require-jq
	@set -e; \
	if [[ -z "$(GENERATED_DIR)" || "$(GENERATED_DIR)" == . || "$(GENERATED_DIR)" == / ]]; then \
	  echo "error: GENERATED_DIR must name a directory that holds only generated code." >&2; \
	  exit 1; \
	fi; \
	rm -rf $(GENERATED_DIR); \
	bash -c "$$RUN_WEAVER" run-weaver generate registry generate \
	  -r "$(SOURCE_REGISTRY)" --v2 --templates $(TEMPLATES) $(CODEGEN_TARGET) $(GENERATED_DIR)

generate-all:: generate
	@:

# Prove the generated code is valid TypeScript for the SDK, with the package's own checks: its
# `check` script (tsc over src/, which includes the generated code and the test asserting the
# generated keys' values, then eslint), and Biome on the generated code and the golden files. npm
# enforces the repo's devEngines (Node ^26.3.0), so run these with that Node.
validate-generated: generate
	cd .. && npm run check
	cd ../../.. && npx biome check packages/web-sdk/src/semconv packages/web-sdk/semconv/templates_test/golden

test:: validate-generated
	@:

# The generated code ships inside @embrace-io/web-sdk, which `npm run build` at the repo root
# builds and the Release workflow publishes, so there is nothing extra to build here.
package-generated: validate-generated
	@echo "nothing to package: the generated code ships inside @embrace-io/web-sdk, which" \
	  "'npm run build' at the repo root builds."

help::
	@echo "generate               regenerate $(GENERATED_DIR)/ from $(SOURCE_REGISTRY)"
	@echo "validate-generated     validate the generated code for its platform"
	@echo "package-generated      build the package consumers of the generated code install"
# ==== end codegen
