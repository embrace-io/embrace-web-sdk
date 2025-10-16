# Embrace Web SDK - OpenTelemetry observability

## ABSOLUTE RULES

**NEVER**:
- Break user apps
- Choose cleverness over clarity and readability
- Create files when editing existing ones works
- Use temporal words ("new", "updated", "legacy", "old")

**ALWAYS**:
- Review existing code patterns before making new files
- Errors: Catch all, log with diag, never throw to user code
- Ask to save complex plans in folder context as (MARKDOWN).MD
- Run before commit: `npm run sdk:tsc:check && npm run sdk:lint:fix && npm run compile && npm run sdk:test`

## Commits, Pull Requests, Branches

**Title Format**: `(type)[(scope)]: imperative-subject`
- Max 150 chars, abbreviate when clear (e.g., "semconv")
- Types: `release|deploy|build|ci|feat|fix|docs|style|refactor|perf|test|chore|revert|breaking`
- Examples: `fix(session): prevent race condition in tab tracking`, `chore(document-load): align resource attributes with semconv`

**Branches**
- Ask for ticket number and description
- If ticket: (gituser)/(type)/EMBR-(ticketnumber)-(three-word-description)
- If no ticket: (gituser)/(type)/((three-word-description)

**Commits**: Title only, no body/description

**PRs**: Title + 3-section body
```markdown
## Why
[Problem statement + benefit. Explain impact, not restate changes.]

## Changes
- [Specific changes as bullets. Be specific about refactors. Quantify when relevant.]

## Testing
- [Test approach and verification steps.]
```

**Rules**:
- Keep it scannable - short sentences, clear bullets
- Quantify when relevant ("5 attributes", "3 files")
- No marketing language or superlatives
- Do not credit Claude
- After commit, if PR exists, update body with details

## Architecture

```
src/api-{logs,sessions,traces,users}/ → ProxyManager → EmbraceManager
src/instrumentations/ → EmbraceInstrumentationBase
src/processors/ → BatchedSpanProcessor, LogRecordProcessor
src/exporters/ → EmbraceTraceExporter, EmbraceLogExporter
```

**Key Pattern**: Proxy wraps NoOp until SDK initializes, then delegates to real manager

## Code Style

**Method Names**: Describe outcome, not process
```typescript
_flushExpiredEntries()  // not _processData()
_findSourceTab()    // not _handleTabLogic()
  ```s

**Comments**: Explain WHY, not what
```typescript
// BAD: Check if timestamp > 20000
// GOOD: 20s window catches legitimate parents while avoiding stale matches
```
