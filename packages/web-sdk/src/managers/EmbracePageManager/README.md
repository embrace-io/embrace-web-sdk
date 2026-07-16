# EmbracePageManager

`EmbracePageManager` is the single source of truth for the current route,
and the sole listener of the Navigation API for soft-navigation detection.

## Component responsibilities

- **`EmbracePageManager`** — holds the current route/page-id/label, listens
  to `window.navigation`'s `currententrychange`, and on every
  `setCurrentRoute` call notifies subscribers via `addRouteChangedListener`.
  On construction, it sets the initial route from the current location,
  since `currententrychange` never fires for the page's own initial entry.
  On a soft navigation, it rolls over the active session part
  (`EmbraceUserSessionManager.rolloverSessionPartInternal`) before reporting
  the new route, and resets the SDK's zero time (`updateZeroTimeMillis`) —
  the same reset `initSDK` performs on `pageshow` for bfcache restores.
- **React-router integrations** (`withEmbraceRouting`,
  `withEmbraceRoutingLegacy`, `listenToRouterChanges`) — call
  `page.setCurrentRoute({ path, url })` once they've resolved the templated
  route. They're optional: the route the SDK derives from the raw pathname
  is a complete, valid route on its own. A react-router integration only
  refines it with the app's route pattern (e.g. `/products/:id`) instead of
  the raw URL, and has no dependency on `NavigationInstrumentation`.
- **`NavigationInstrumentation`** — subscribes to `addRouteChangedListener`
  (mirrors route changes into `ux.surface` spans: same url renames the open
  span in place, different url ends the old span and starts a new one), to
  the session-part-ended listener (ends the open route span so it never
  outlives the session part it started in), and to the session-part-started
  listener (opens a span for the current route when a new part starts with
  no route change — e.g. resuming from the background — skipped when the
  part started from a soft navigation, since the real new route follows
  immediately).
- **`EmbraceUserSessionManager`** — owns session-part start/end/rollover; has
  no interaction with the Navigation API.

## Soft-navigation flow

```mermaid
sequenceDiagram
    participant Browser
    participant PageManager as EmbracePageManager
    participant SessionMgr as EmbraceUserSessionManager
    participant NavInstr as NavigationInstrumentation
    participant Processor as EmbraceSessionPartBatchedSpanProcessor
    participant Router as react-router integration

    Browser->>PageManager: currententrychange
    PageManager->>SessionMgr: rolloverSessionPartInternal()
    SessionMgr->>SessionMgr: end OLD session-part span (not yet closed)
    SessionMgr->>NavInstr: session-part-ended
    NavInstr->>NavInstr: end OLD route span
    NavInstr-->>Processor: onEnd(old route span) — queued
    SessionMgr->>Processor: onEnd(old session-part span)
    Processor->>Processor: flush [old session-part span, old route span, ...]
    SessionMgr->>SessionMgr: start NEW session-part span

    PageManager->>PageManager: setCurrentRoute({ path: pathname, url: pathname })
    PageManager->>NavInstr: routeChanged (initial route, no span open)
    NavInstr->>NavInstr: start NEW route span (named from raw pathname)

    Note over Router: later, async — React render commits
    Router->>PageManager: setCurrentRoute({ path: resolvedPath, url: pathname })
    PageManager->>NavInstr: routeChanged (resolved, same url)
    NavInstr->>NavInstr: rename open span in place (no new span created)
```

### Ordering inside `_onSoftNavigation`

`_onSoftNavigation` rolls over the active session part before reporting the
new route. This matters because `EmbraceSessionPartBatchedSpanProcessor`
doesn't tag spans with a session-part id — it queues every span as it ends
and flushes the queue whenever a session-part span ends, so a span's
attribution is decided by *ending order*, not by when it started.
`NavigationInstrumentation` ends its route span from the session-part-ended
listener, which `EmbraceUserSessionManager.endSessionPartInternal` fires
**before** ending the outgoing session-part span itself. Rolling over first
means the outgoing route span is already ended and queued, correctly
attributed to the outgoing part, by the time that part's span flushes.

### Route spans never outlive their session part

A route span always closes on whichever of these happens first:

- a new route is reported (`_onRouteChanged` sees a different url), or
- the session part it started in ends, for any reason (soft nav,
  backgrounding, inactivity, manual `endUserSession()`).

### Resuming on session-part-start

When a new session part starts with no route change (e.g. resuming from the
background), `NavigationInstrumentation` opens a span for the current route
directly from its session-part-started listener, since no route-changed
event fires on its own in that case. This is skipped when the part started
from a soft navigation (`web_soft_navigation`), since `_onSoftNavigation`
reports the real new route immediately after the rollover.
