# Embrace Web SDK

Observability SDK for web applications built on OpenTelemetry. Captures Spans (traces) and Logs to help debug and monitor user experiences.

## Behavior Guidelines

**NEVER**:

- Reference change-history in code, comments, or commits (`updated`, `legacy`, `old`, `previously`, "renamed from"). Describing a freshly-created runtime entity as `new` (e.g. "the new span") is fine
- Name competing observability vendors in source or docs

**ALWAYS**:

- Review existing patterns and prefer editing an existing file over creating a new one
- After committing, update PR body if one exists

## Quick Reference

Commands are npm scripts, mostly at the repo root; the web-sdk-only ones (`test:manual`, `test:watch`, `test:coverage`, `check:dist`, `docs`) live in `packages/web-sdk/package.json`. What those files don't tell you:

- Run `lint`/`check` from the repo root so turbo and Biome cover every workspace. Scoping them to one package leaves the others unchecked.
- `validate` builds first on its own, so ordering is not your problem. Its first two stages are, though: `validate:versions` and a `THIRD_PARTY_NOTICES.txt` that must be diff-clean, both of which fail for reasons unrelated to the build.
- `dev` serves the demo at http://localhost:4847 and also starts the debug collector at http://localhost:3001 (point telemetry at it with `VITE_DATA_URL`).

## Architecture

Turbo + npm-workspaces monorepo (`packages/*`, `demo/*`, `server`, `tests/integration`). The published SDK is `packages/web-sdk`, with source under `packages/web-sdk/src/`.

Two non-obvious things about `instrumentations/`, which covers auto-capture: fetch/XHR use the upstream OTel instrumentations rather than our own, and only span/log emitters belong there (detectors that emit no telemetry go in `utils/`).

### Key Patterns

**Proxy/No-Op Pattern**: Public APIs (`trace`, `log`, `session`, `user`, `page`) default to no-ops until SDK initializes. Safe to call before initialization.

**Processor Chain**: Spans and logs flow through processors that add attributes, scrub sensitive data, and batch for export.

**Layered Architecture**: `api-*` (interfaces/proxies) → `managers/` (implementations) → `processors/exporters/` (infrastructure)

## Code Conventions

### TypeScript

- **Import extensions required**: Always use `.ts` extension in imports
- **Type imports**: Use `import type` for type-only imports
- **No re-exports**: `export * from` forbidden (use explicit exports)

### Naming

- **Classes**: PascalCase with `Embrace` prefix for implementations
- **Static-only classes**: Used for API singletons (OTel convention)
- **Attributes**: `emb.` prefix for Embrace-specific
- **Session terminology**: never write bare "session". Use **user session** or **session part**, in prose and in identifiers (`UserSession*`, `SessionPart*`). They are distinct concepts
- **No abbreviations**: spell identifiers out: `terminationInfo` not `termInfo`, `timestamp` not `ts`
- **`Id` casing**: never mix `ID` and `Id` suffixes. Pick one and stay consistent

### File Organization

- **Co-located tests**: `*.test.ts` next to implementation
- **Index files**: Each module has `index.ts` for exports
- **Types**: Separate `types.ts` files for interfaces

### Comments

- **TSDoc** on public APIs. **WHY-only** on internals (the code shows the what)
- No performance trivia, and no bare "§X.Y" / "per section N" spec reference without a link (drop the marker if there is none)

## Testing

### Unit Tests

Framework: @web/test-runner + Playwright + Mocha + Chai. `test:manual`, `test:watch`, and `test:coverage` exist only in `packages/web-sdk/`.

A root `npm run test` expands to 14 tasks: the web-cli and integration suites as well, plus a `clean` and `build` on both packages and a `build-platforms` that rebuilds every integration bundler. Scope to the SDK from the root instead, which runs exactly one:

```bash
npx turbo run test --filter=@embrace-io/web-sdk
```

**Run a single test file** (paths are workspace-relative, i.e. relative to `packages/web-sdk/`):

```bash
npx turbo run test --filter=@embrace-io/web-sdk -- --files "src/utils/throttle.test.ts"
```

### Integration Tests

Test SDK against bundlers (Webpack 5, Vite 6/7, Next.js 15/16). `test:integration` runs against built artifacts, so `build` first.

Golden files are nondeterministic: instance IDs, trace/span IDs, and timestamps regenerate on every run, so a hand edit is indistinguishable from a real change on the next regeneration. Never hand-edit them.

Regenerating has a procedure that is easy to get wrong (which script, and how to read a diff that reorders thousands of lines). Use the `regenerating-golden-files` skill rather than working it out from the scripts.

### Conventions

- Hardcode contract / wire-format values in tests (attribute keys, payload shapes). Importing them defeats the test. Importing purely-internal constants is fine
- No test-only escape hatches (`_setX`/`_resetX`). If defensive code is unreachable, delete it rather than expose a hook to cover it

## Constraints

### Browser Compatibility

- Baseline Widely Available APIs only (eslint-plugin-baseline-js enforced)
- CDN bundle targets ES6

### Error Handling

- Catch all exceptions in public APIs
- Log via `diag` diagnostic channel
- Never throw to user code

### Transport

- Telemetry on the unload path (`pagehide` / `visibilitychange` to hidden) is sent via keepalive `fetch` (the SDK does not use `sendBeacon`). The browser only grants a synchronous budget during unload, so async work (Promises, timers) may not run before teardown. Prefer synchronous work here and avoid adding `await`s. Note: gzip compression currently uses `CompressionStream` (async), a known teardown-race fragility, not a pattern to copy

### Time

- Anything touching timestamps or timing attributes must convert through `OTelPerformanceManager` (`this.perf`), never by hand or with raw offsets. Read `packages/web-sdk/src/utils/PerformanceManager/README.md` first — it defines the two reference frames (time origin vs zero time) and which method fits each case

## Git Workflow

### Branches

- Ask for ticket number and description
- With ticket: `(gituser)/EMBR-(ticket)-(description)`
- Without: `(gituser)/(description)`

### Commits

**Format**: `(type)[(scope)]: imperative-subject`

**Examples**:

- `feat(fetch): add custom span attributes`
- `fix(sdk): handle missing window object`
- `EMBR-1234 refactor(processors): simplify scrubbing logic`

**Types**: `release|deploy|build|ci|feat|fix|docs|style|refactor|perf|test|chore|revert|breaking`

**Rules**:

- Max 150 characters
- Title only, no body, no credits
- Optional EMBR-XXXX ticket prefix

### Pull Requests

**Format**: `EMBR-(ticket) (type)[(scope)]: subject`

Fill the sections in `.github/PULL_REQUEST_TEMPLATE.md` (What problem / Short description / How tested / Checklist). As a rough guide, scale the body to the size of the diff: a small change can be a line or two, a large one can run fuller. Avoid exhaustive or commit-by-commit detail. Cover the full diff vs `main` (not just the latest commit), and tick checklist items to reflect reality.
