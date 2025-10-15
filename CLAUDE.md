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

**Format**: `(type)[(scope)]: imperative-subject`
- Max 150 chars
- Types: `release|deploy|build|ci|feat|fix|docs|style|refactor|perf|test|chore|revert|breaking`
- Example: `fix(session): prevent race condition in tab tracking`
- Do NOT include Claude credits
- Keep commit description concise

## Pull Requests

**Title**: Same format as commits, abbreviate when clear (e.g., "semconv")
- Example: `chore(document-load): align resource attributes with semconv`

**Body**: Exactly 3 sections
```markdown
## Why
[Problem statement + benefit. Explain impact, not restate changes.]

## Changes
- [Specific changes as bullets. Use → for transformations. Quantify when relevant.]

## Testing
- [Test approach and verification steps.]
```

**Rules**:
- Keep it scannable - short sentences, clear bullets
- Use arrows (→) to show before/after transformations
- Quantify when relevant ("5 attributes", "3 files")
- No marketing language or superlatives

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
