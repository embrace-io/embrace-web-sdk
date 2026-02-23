# Embrace Web SDK

Observability SDK for web applications built on OpenTelemetry. Captures Spans (traces) and Logs to help debug and monitor user experiences.

## Behavior Guidelines

**NEVER**:
- Choose cleverness over clarity and readability
- Create files when editing existing ones works
- Use temporal words ("new", "updated", "legacy", "old") in code/commits

**ALWAYS**:
- Review existing code patterns before creating files
- After committing, update PR body if one exists

## Quick Reference

```bash
# Build
npm run build                    # Build all packages (turbo)

# Test
npm run test                     # Run unit tests (turbo)
npm run test:integration         # Integration tests (requires build first)

# Lint & Check
npm run lint                     # Auto-fix with Biome
npm run validate                 # All checks (tsc + eslint baseline)
```

## Architecture

### Source Layout (`packages/web-sdk/src/`)

```
api-*/          Public APIs with no-op defaults (traces, logs, sessions, users, page)
managers/       Concrete implementations (EmbraceTraceManager, EmbraceLogManager, etc.)
processors/     Span/Log processing chain (scrubbing, batching, session correlation)
exporters/      OTLP serialization for Embrace backend
instrumentations/  Auto-capture plugins (fetch, XHR, web-vitals, clicks, exceptions)
sdk/            Entry point (initSDK) and configuration
transport/      HTTP transport with retry logic
```

### Key Patterns

**Proxy/No-Op Pattern**: Public APIs (`trace`, `log`, `session`, `user`, `page`) default to no-ops until SDK initializes. Safe to call before initialization.

**Processor Chain**: Spans and logs flow through processors that add attributes, scrub sensitive data, and batch for export.

**Layered Architecture**: `api-*` (interfaces/proxies) → `managers/` (implementations) → `processors/exporters/` (infrastructure)

### Distribution

| Format | Target | Use Case |
|--------|--------|----------|
| ESM    | ES2022 | npm package (import) |
| CJS    | ES2022 | npm package (require) |
| IIFE   | ES6    | CDN script tag (`window.EmbraceWebSdk`) |

## Code Conventions

### TypeScript

- **Import extensions required**: Always use `.ts` extension in imports
- **Type imports**: Use `import type` for type-only imports
- **Single quotes**: Enforced by Biome
- **No re-exports**: `export * from` forbidden (use explicit exports)
- **No import cycles**: Biome `noImportCycles` enforced

### Naming

- **Classes**: PascalCase with `Embrace` prefix for implementations
- **Static-only classes**: Used for API singletons (OTel convention)
- **Attributes**: `emb.` prefix for Embrace-specific, `app.surface.*` for pages

### File Organization

- **Co-located tests**: `*.test.ts` next to implementation
- **Index files**: Each module has `index.ts` for exports
- **Types**: Separate `types.ts` files for interfaces

## Testing

### Unit Tests

Framework: @web/test-runner + Playwright + Mocha + Chai

```bash
npm run test                  # Headless (from packages/web-sdk/)
npm run test:manual           # Browser with DevTools
npm run test:watch            # Watch mode
```

### Integration Tests

Test SDK against bundlers (Webpack 4/5, Vite 7, Next.js):

```bash
npm run build                             # Build first
npm run test:integration                  # Run tests
npm run test:integration:update-golden    # Update golden files
```

## Constraints

### Browser Compatibility

- Baseline Widely Available APIs only (eslint-plugin-baseline-js enforced)
- CDN bundle targets ES6
- Requires `CompressionStream` for Embrace backend

### OpenTelemetry

- API: `@opentelemetry/api` ^1.9.0
- Attribute values must be strings when exporting to Embrace

### Sensitive Data

- Default scrubbers remove auth tokens, passwords from URLs/attributes
- Configure with `attributeScrubbers` in `initSDK`

### Error Handling

- Catch all exceptions in public APIs
- Log via `diag` diagnostic channel
- Never throw to user code

## Common Tasks

### Adding an Instrumentation

1. Create in `packages/web-sdk/src/instrumentations/<name>/`
2. Extend `EmbraceInstrumentationBase`
3. Export from `packages/web-sdk/src/instrumentations/index.ts`
4. Register in `setupDefaultInstrumentations.ts` if auto-enabled

### Adding a Processor

1. Create in `packages/web-sdk/src/processors/<Name>Processor/`
2. Implement `SpanProcessor` or `LogRecordProcessor`
3. Export from `packages/web-sdk/src/processors/index.ts`
4. Wire into processor chain in `initSDK.ts`

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

**Body template**:
```
## What problem is this solving?
[Impact statement]

## Short description of changes
- [Specific bullets]

## Testing
- [Verification steps]
```

## Troubleshooting

### SDK Not Initializing

- Check for `window` (server-side rendering guard)
- Verify `CompressionStream` support
- Check `restrictedProtocols` (default blocks `file:`)

### Tests Flaky

- Ensure `npm run build` before integration tests
- Use `npm run test:manual` for debugging (from `packages/web-sdk/`)
