# Embrace Web SDK

OpenTelemetry observability. Telemetry must NEVER break user apps.

## ABSOLUTE RULES

**NEVER**:
- Use `--no-verify` on commits
- Create files when editing existing ones works
- Use temporal words ("new", "updated", "legacy", "old")
- Commit .md files without explicit user confirmation

**ALWAYS**:
- Run before commit: `npm run sdk:lint:fix && npm run compile && npm run sdk:test`
- Fix lint: `npm run sdk:lint:fix`
- Check types: `npm run sdk:tsc:check`

## Git Commits

**Format**: `[EMBR-XXX] (type)[(scope)]: imperative-subject`
- Max 150 chars
- Types: `release|deploy|build|ci|feat|fix|docs|style|refactor|perf|test|chore|revert|breaking`
- Example: `[EMBR-123] fix(session): prevent race condition in tab tracking`
- Do NOT include Claude credits
- Keep commit description concise

## Code Style

**Comments**: Explain WHY, not what
```typescript
// BAD: Check if timestamp > 20000
// GOOD: 20s window catches legitimate parents while avoiding stale matches
```

**Method Names**: Describe outcome, not process
```typescript
_pruneOldEntries()  // not _processData()
_findParentTab()    // not _handleTabLogic()
```

**Constants**: Include units
```typescript
const PARENT_TAB_WINDOW_MS = 20_000;  // not TIMEOUT = 20000
const CLEANUP_AFTER_MS = 30 * 60 * 1000;
```

## Architecture

```
src/api-{logs,sessions,traces,users}/ → ProxyManager → EmbraceManager
src/instrumentations/ → EmbraceInstrumentationBase
src/processors/ → BatchedSpanProcessor, LogRecordProcessor
src/exporters/ → EmbraceTraceExporter, EmbraceLogExporter
```

**Key Pattern**: Proxy wraps NoOp until SDK initializes, then delegates to real manager

## Critical Behaviors

- **Storage**: localStorage/sessionStorage are synchronous - minimize use
- **Errors**: Catch all, log to diag, never throw to user code
- **Limits**: Handle quotas, prune old data, respect thresholds
- **Race conditions**: Account for multi-tab timing but keep it simple

## Testing

```typescript
import { InMemoryStorage } from '../../testUtils';
void expect(sessionId).to.be.null;  // nullable assertions
```

Golden files: `npm run sdk:test:integration:e2e:update-golden`
