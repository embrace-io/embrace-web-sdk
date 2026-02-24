# EmbraceSpanSessionManager

Manages browser session spans with lifecycle tracking, properties, breadcrumbs, and cross-tab relationships.

## Core Features

- **Session Lifecycle**: Creates OpenTelemetry spans representing user sessions
- **Properties**: Temporary (session-scoped) and permanent (persisted in localStorage) properties
- **Breadcrumbs**: Records user interactions as span events within the session
- **Session Numbers**: Global counter persisted in localStorage across all tabs
- **Cross-Tab Tracking**: Links tabs opened from other tabs using parent-child relationships

## Cross-Tab Tracking

Tracks parent-child relationships between tabs to understand user navigation flows.

### Key Concepts

- **Tab ID**: Unique identifier for each browser tab
- **Parent Tab ID**: ID of the tab that opened this tab (if any)
- **Experience ID**: Groups related tabs in the same browsing journey

### Implementation

1. **Storage Strategy**
   - Current tab identity stored in sessionStorage (persists through page reloads)
   - Tab activity data stored in localStorage under `embrace_tab_activity` key
   - Session number stored in localStorage under `embrace_session_number` key

2. **Parent Detection**
   - Checks `document.referrer` for same-origin URLs
   - Finds the most recently active tab within a short time window
   - Most recent tab becomes the parent

3. **Activity Tracking**
   - Records activity when tab becomes visible
   - Captures clicks that open new tabs (middle-click, Ctrl/Cmd+click, target="_blank")
   - Intercepts `window.open()` calls
   - Updates activity timestamp in localStorage


### Span Attributes

```
emb.tab_id         - This tab's unique ID
emb.parent_tab_id  - ID of tab that opened this one (if present)
emb.experience_id  - Shared across related tabs
```

## Back-Forward Cache (bfcache) Handling

Modern browsers cache entire pages in memory to enable instant back/forward navigation. This preserves the JavaScript execution context, which affects session tracking.

### What is bfcache?

When a user navigates away from a page, Chrome may preserve the entire page state in memory rather than destroying it. When the user presses the back button, the page is restored from this cache with all JavaScript state intact—constructors don't run again, event listeners remain attached, and timers continue.

### Navigation Source Detection

**The Problem**: Navigation Timing API reports `type: "reload"` with `deliveryType: "cache"` when restoring from bfcache, not `type: "back_forward"`.

**The Solution**: Listen for `pageshow` events and check `event.persisted`:
- `event.persisted === true` means page was restored from bfcache
- Update `_navigationSource` to `'back_forward'`
- Start a new session (which inherits the updated navigation source)

```typescript
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    this._navigationSource = 'back_forward';
    this.startSessionSpan({ reason: 'bfcache_restore' });
  }
}, { passive: true });
```

### Session Lifecycle Behavior

**Sessions end and restart** when pages enter/exit bfcache:

**When entering bfcache** (`pagehide` with `event.persisted === true`):
- If `SpanSessionVisibilityInstrumentation` is enabled: session ends with reason `'state_changed'` (visibilitychange fires before pagehide)
- If `SpanSessionVisibilityInstrumentation` is disabled: session ends with reason `'bfcache'`
- Session span is closed and exported with all accumulated data
- Pending spans are flushed

**When restoring from bfcache** (`pageshow` with `event.persisted === true`):
- New session starts with reason `'bfcache_restore'`
- `_navigationSource` set to `'back_forward'`
- `_coldStart` remains `false` (bfcache restoration is not a cold start)
- New session ID is generated
- Permanent properties are reloaded from localStorage
- `SpanSessionVisibilityInstrumentation` skips the subsequent visibilitychange event to avoid double-handling

**Rationale**: Treating bfcache transitions as session boundaries provides clearer session analytics and ensures data is exported when users navigate away.

### Potential Issues

#### 1. Pending Network Exports (Already Handled)

**The Problem**: When a page enters bfcache, pending `fetch()` requests could be aborted by the browser.

**Event Timing**:
- `pagehide` fires BEFORE page enters bfcache ✅ (you can still execute code)
- Page freezes in bfcache ⏸️ (no events, no timers, no network)
- `pageshow` fires AFTER restoration ✅ (execution resumes)

**Current behavior**: ✅ Already handled correctly
- Session ends synchronously in `pagehide`, triggering span export
- Exports use `fetch()` with `keepalive: true` by default (see `exporters/constants.ts`)
- Browser completes the request even after the page freezes

### Additional Considerations

1. **SDK Startup Duration**: Measures original page load, not bfcache restoration time. This is correct—SDK doesn't "start up" again on restoration.

2. **Event Listeners**: All listeners remain attached and functional after bfcache restoration. Verify they don't capture stale closures.

3. **Tab Activity Tracking**: Click listeners continue working correctly. Timestamps update on each click regardless of bfcache cycles.

4. **Performance Observers**: If instrumentations track page lifecycle events (web vitals, resource timing), verify they handle bfcache restoration correctly—observers should not double-count or miss events.

5. **Multiple Back/Forward Cycles**: Users can navigate back and forth repeatedly. Each restoration updates the navigation source correctly—logic is idempotent.

### Testing bfcache Behavior

1. Navigate to a page with an active session (note the session ID)
2. Click an external link (e.g., google.com)
3. Verify in logs: `Page entering bfcache, ending session`
4. Press browser back button
5. Verify in logs: `Page restored from bfcache, starting new session`
6. Verify in logs: `Skipping visibility change handling after bfcache restoration`
7. Verify navigation source shows `'back_forward'`
8. Verify session ID changed (new session was created)
9. Verify previous session was exported with reason `'state_changed'` (or `'bfcache'` if visibility instrumentation disabled)
10. Verify new session has reason `'bfcache_restore'`
11. Verify event listeners still work
12. Test multiple back/forward cycles (each should create new sessions)
13. Test behavior after extended time in bfcache

**Chrome DevTools**: Use Application > Back/forward cache panel to test bfcache eligibility and behavior.
