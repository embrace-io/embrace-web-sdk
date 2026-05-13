# Span Session Manager

`EmbraceSpanSessionManager` is the source of truth for user-session and
session-part state across all tabs in this browser.

## Two-level model

The manager tracks two distinct things:

- **User session.** An identity container with a UUID, a monotonic number, a
  start timestamp, a max-duration deadline, and a property map. Persisted as one
  JSON blob in `localStorage` under `embrace_user_session_state`. It spans tabs
  and outlives any single page load.
- **Session part.** A contiguous foreground engagement window on one tab,
  represented as a span with `emb.type = ux.session_part`. Exactly one session
  part is active across all tabs at any time, because a part can only start when
  the tab is both visible and focused.

A user session contains one or more session parts, indexed within the user
session by `emb.user_session_part_index`. Each session part also carries
`emb.session_part_number`, a monotonically increasing counter across all
parts ever generated in this browser since the first visit. Each session
part is bound to a user session at start time.

## Public API surface

The `SpanSessionManager` interface exposes the following methods.

### Active

| Method | Behavior |
| --- | --- |
| `getUserSessionId()` | Returns the current user session UUID or `null`. |
| `getPreviousUserSessionId()` | Returns the prior user session UUID or `null`. |
| `getUserSessionStartTime()` | Returns wall-clock milliseconds since Unix epoch, or `null`. |
| `endUserSession()` | Ends the current user session. Subject to a 5 second cooldown. No-op if no user session is active. If no session part is active when called, the user session ends silently because there is no part span to carry the termination reason. |
| `addBreadcrumb(name)` | Adds an `emb-breadcrumb` event to the active session-part span. Dropped if no part is active. |
| `addProperty(key, value, options?)` | Stores a key-value pair. `lifespan: 'permanent'` writes to the `embrace_permanent_properties` blob and survives user-session boundaries. Without `lifespan`, the entry lives inside the user-session state row and is cleared on user-session end. Safe to call before the first session part starts; the call eager-initializes a user-session row so the value is stamped on the part span when it begins. |
| `removeProperty(key)` | Removes the key from all stores. If a session part is active, also removes the corresponding span attribute. |

### Deprecated forwarders

These exist for source compatibility with the prior API. Some forward to the
new equivalents; others are inert (return `null` or no-op).

| Method | Behavior |
| --- | --- |
| `getSessionId()` | Forwards to `getUserSessionId()`. |
| `getSessionStartTime()` | Forwards to `getUserSessionStartTime()` (returns milliseconds since the Unix epoch). |
| `getSessionSpan()` | Forwards to the active session-part span. |
| `endSessionSpan()` | Forwards to `endUserSession()`. |
| `getPreviousSessionId()` | Always returns `null`. Use `getPreviousUserSessionId()`. |
| `currentSessionAsReadableSpan()` | Always returns `null`. |
| `startSessionSpan()` | No-op. User sessions start implicitly on first engagement, not via a public API. |
| `addSessionStartedListener()` | Returns a no-op unsubscribe. The listener is never called. |
| `addSessionEndedListener()` | Returns a no-op unsubscribe. The listener is never called. |

### Internal interface

`SpanSessionManagerInternal` extends the public interface with members used by
instrumentations and processors only:

- `startSessionPartInternal(reason)`, `endSessionPartInternal(reason, userSessionEndReason?)`
- `getSessionPartId()`, `getSessionPartSpan()`
- `incrSessionPartCountForKey(key)` and `incrNextSessionPartCountForKey(key)`
- `addSessionPartStartedListener(listener)`, `addSessionPartEndedListener(listener)`
- `setTracerProvider(tracerProvider)`, which must be called before the first
  session part starts.

In addition, the concrete class exposes `recordSDKStartupDuration(ms)`. The
SDK init flow calls this once with the measured startup duration; the value
is stamped as `emb.sdk_startup_duration` on every session-part end span.

## Session-part lifecycle

### Start

`startSessionPartInternal(reason)` is a no-op unless **both** of the following
are true at call time:

- `document.visibilityState === 'visible'`
- `document.hasFocus()` returns `true`

If a session part is already active, the call is a warn-level no-op. If neither
engagement condition holds, the call is a debug-level no-op.

### Start triggers

`SessionPartStartReason` enumerates every reason a session part can begin:

| Value | Trigger |
| --- | --- |
| `init` | SDK init flow on page load. |
| `web_foreground` | `visibilitychange` to visible, `focus`, or `pageshow` while no part is active and the tab is engaged. Also covers the BFCache restore path. |
| `web_activity` | `keydown`, `mousedown`, `mousemove`, or `scroll` while no part is active and the tab is engaged. Subject to the 30 second activity throttle. |
| `user_session_rollover` | Called synchronously by `_terminateUserSession` immediately after a user session ends. |

### End triggers

`SessionPartEndReason` enumerates every reason a session part can end:

| Value | Trigger |
| --- | --- |
| `web_background` | `visibilitychange` to hidden, `blur`, or `pagehide` while a session part is active. |
| `inactivity` | The 30 minute part-inactivity timer fires without any user input event resetting it. |
| `user_session_ended` | `_terminateUserSession` ending the active part, fired on manual `endUserSession()` or max-duration expiry. |

### End behavior

On end, the manager:

1. Fires `_sessionPartEndedListeners`.
2. Inside a `try`: refreshes user-session-scoped properties from storage to
   capture cross-tab writes, builds the end attributes, and applies them via
   `span.setAttributes` (inner `try`/`catch` so a poisoned attribute can't
   prevent the span from ending).
3. Inside `finally`: ends the span and clears `_sessionPartSpan`,
   `_activeSessionPartId`, and `_activeSessionPartCounts`.
4. If `reason !== 'user_session_ended'`, calls
   `_continueUserSessionAfterPartEnd(partEndTs)` which writes
   `partEndTs + inactivityTimeoutSeconds * 1000` into the state blob's
   `inactivityDeadlineTs` and re-arms the max-duration timer.

When `reason === 'user_session_ended'` the manager also stamps
`emb.is_final_session_part = 1` and (if a `userSessionEndReason` was passed in,
which `_terminateUserSession` always does)
`emb.user_session_termination_reason`.

## User-session lifecycle

### Creation

User-session creation is lazy. No user-session object exists between
`endUserSession()` and the next `startSessionPartInternal` call that passes the
engagement gate. Creation happens inside `_beginUserSessionForPartStart`:

1. Read the state blob from storage.
2. If null or `_isExpired(state, now)`, save the old ID into
   `_previousUserSessionId` and call `_createSession(now)` to mint a fresh user
   session.
3. Increment `userSessionPartIndex` by 1, and bump the
   `embrace_session_part_number` storage counter (persisted across visits
   and snapshotted into `_currentSessionPartNumber`).
4. Set `inactivityDeadlineTs` to `null` (a session part is now active).
5. Write the state blob back.
6. Arm the max-duration timer.

### Expiry

`_isExpired` returns `true` when any of the following holds:

- `now < state.userSessionStartTs`. The clock jumped backwards.
- `now >= state.userSessionMaxEndTs`. The max-duration boundary has passed.
- `state.inactivityDeadlineTs !== null && now >= state.inactivityDeadlineTs`.
  The inactivity window since the last part end has elapsed.

There is no live timer for the inactivity window. The deadline is checked at
the next part start. The expired part span is already exported and does not
receive `emb.is_final_session_part`.

### Termination

`_terminateUserSession(reason)` is the only path that ends a user session. It
is called from:

- `endUserSession()` with reason `manual`.
- The max-duration `setTimeout` callback with reason `max_duration_reached`.

`UserSessionEndReason` defines all possible values:

| Value | Trigger | Emitted by web SDK |
| --- | --- | --- |
| `manual` | `endUserSession()` API call. | Yes |
| `max_duration_reached` | Max-duration timer fires. | Yes |
| `inactivity` | Reserved value. | No. Inactivity is detected lazily at next part start, after the prior part span is already exported. |

On termination the manager calls
`endSessionPartInternal('user_session_ended', reason)`, saves
`_previousUserSessionId`, sets `_state` to `null`, removes the storage row, and
immediately calls `startSessionPartInternal('user_session_rollover')`. That
follow-up call mints a fresh user session if the tab is still engaged, or
silently no-ops if not (the next engagement event will create it).

## Timers

| Timer | Constant | Default | Range | Effect on fire |
| --- | --- | --- | --- | --- |
| Max duration | `DEFAULT_USER_SESSION_MAX_DURATION_SECONDS` | 12 hours | `MIN_USER_SESSION_MAX_DURATION_SECONDS` (1h) to `MAX_USER_SESSION_MAX_DURATION_SECONDS` (24h) | `_terminateUserSession('max_duration_reached')` |
| User-session inactivity (lazy) | `DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS` | 30 minutes | `MIN_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS` (30s) to `MAX_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS` (24h) | Not a live timer. The configured value is written into the state blob as `inactivityTimeoutSeconds`, and `_continueUserSessionAfterPartEnd` records `partEndTs + inactivityTimeoutSeconds * 1000` into `inactivityDeadlineTs`. Checked on the next part start by `_isExpired`. |
| Part inactivity | `PART_INACTIVITY_TIMEOUT_MS` | 30 minutes | n/a | `endSessionPartInternal('inactivity')` |
| Activity throttle | `ACTIVITY_THROTTLE_MS` | 30 seconds | n/a | At most one inactivity-timer reset per 30 seconds of input. |
| `endUserSession` cooldown | `END_USER_SESSION_COOLDOWN_MS` | 5 seconds | n/a | Calls within 5 seconds of the last call are silently ignored. |

Both `maxUserSessionDurationSeconds` and `inactivityTimeoutSeconds` are clamped to their
respective ranges at construction; out-of-range values fall back to the
default and emit a warning. In addition, `inactivityTimeoutSeconds` must be
`<=` `maxUserSessionDurationSeconds`; if a caller violates that, the inactivity timeout falls
back to its **default**, not to the max-duration value.

The max-duration timer is armed on session-part start AND re-armed after
session-part end, so it runs even between parts. The delay is computed as
`state.userSessionMaxEndTs - now`, not the full duration value.

The part-inactivity timer is restarted on every activity event, subject to the
30 second throttle, and cleared on session-part end.

## Storage

### Keys

| Key | Contents | Lifetime |
| --- | --- | --- |
| `embrace_user_session_state` | JSON-serialized `UserSessionState` (id, previous id, start ts, max-end ts, numbers, durations, deadline, properties) | Cleared on `_terminateUserSession`. Written on every part start, every part end (to update `inactivityDeadlineTs`), and on every user-session-scoped `addProperty` / `removeProperty` call while a user session exists. |
| `embrace_user_session_number` | Monotonic integer string. | Persisted across visits. Only ever incremented. |
| `embrace_session_part_number` | Monotonic integer string. | Persisted across visits. Bumped at every session-part start. |
| `emb.properties.<key>` | String value. | Persisted across visits. Survives user-session boundaries. |

`maxUserSessionDurationSeconds` and `inactivityTimeoutSeconds` are frozen into the state blob at
session creation. A config change between page loads does not affect a user
session already in progress.

### Failure handling

`NamespacedStorage` wraps `localStorage` access. The first `setItem` throw flips
a sticky `_writeDisabled` flag, logs one error, and silently no-ops further
writes. `getItem` and `removeItem` keep trying.

The manager treats its in-memory state as locally authoritative: every mutating
call (`addProperty`, `removeProperty`, lifecycle bookkeeping) updates `_state`
or `_permanentProperties` first and then persists best-effort. Failed writes do
not roll the in-memory update back, so the local tab continues to see and
stamp every value it set even after storage goes read-only. Cross-tab visibility
is the cost: a write that never reaches disk is invisible to other tabs.

The one exception is the cross-scope flip in `addProperty(key, val, { lifespan:
'permanent' })`. The session-scoped entry for the same key is stripped only
after the permanent blob persists, so a failed permanent write does not drop the
previously-visible session value.

A storage write failure never terminates the user session.

## Cross-tab behavior

### Engagement mutex

A session part can only start when the tab is visible and focused. Only the
focused tab can hold a part. A tab that loses focus ends its part with reason
`web_background`. This makes `localStorage` the single source of truth with
no write contention during active parts and no need for cross-tab event
listeners. The class-level doc comment on `EmbraceSpanSessionManager` records
the choice.

### Property visibility

When Tab A calls `addProperty('k', 'v')` during an active part, the value is
written into the state blob's `userSessionProperties` and stamped on Tab A's
part span at part end. Tab B sees the value the next time it reads the state
blob, which is at its next part start. Engagement gating guarantees that only
one tab has an active part at a time, so there is no mid-part refresh from
storage: the active tab is also the writing tab.

### Rollover cascade

There is no explicit cascade. When one tab ends a user session, the state row
is deleted. The next tab to attempt a part start reads `null`, mints a fresh
user session, and the rollover propagates naturally. The previous user-session
ID is linked through `previousUserSessionId` in the new blob.

### Dead tab

If a tab dies mid-part without calling `endSessionPartInternal`, the state blob
remains in storage with `inactivityDeadlineTs = null`. The next tab to engage
reads this state. Because the deadline is null and the max-duration boundary
has not necessarily passed, the dead tab's user session is continued. Abrupt
tab close is by design not a user-session boundary.

### Cross-tab safety hardening

Several specific edge cases are handled:

- Part finalization isolates a throwing `setAttributes` call from `span.end()`,
  so a poisoned permanent-property value cannot drop the part span from the
  export.
- A peer tab that learns about a user-session rollover never stamps the dying
  tab's inactivity deadline onto the new user session's storage row. This is
  structural rather than active: the engagement gate guarantees the peer tab
  has no active part at the moment of rollover, so no `_continueUserSessionAfterPartEnd`
  call can race with the wipe. The peer's stale max-duration timer is cleared
  lazily, on its next `_setupMaxDurationTimer` call (the next part start). If
  the stale timer fires first, `_terminateUserSession('max_duration_reached')`
  runs benignly against the already-cleared storage row.

## BFCache handling

There is no BFCache-specific code in the manager. Behavior is absorbed by the
existing engagement events:

- **Freeze** (entering BFCache). `pagehide` fires.
  `EmbraceSpanSessionManager._onEngagementChange` ends the active part with
  reason `web_background`.
- **Restore** (leaving BFCache). `pageshow` fires. If the document is visible
  and focused and no part is active, a new part starts with reason
  `web_foreground`. If the document restores hidden, no part starts.

The in-memory `_state` survives the freeze-restore cycle because BFCache
preserves the JS heap.

## Attributes

### Stamped at session-part start

| Attribute | Value |
| --- | --- |
| `emb.type` | `ux.session_part` |
| `emb.state` | `foreground` |
| `emb.session_part_id` | UUID unique to this part. |
| `emb.session_part_number` | 1-indexed monotonic count across all visits since the first visit, incremented per session part. |
| `emb.session_part_start_reason` | One of `SessionPartStartReason`. |
| `emb.cold_start` | `true` on the first part started by this manager instance, `false` thereafter. |
| `emb.user_session_id` | UUID of the enclosing user session. |
| `emb.user_session_number` | 1-indexed monotonic count across all visits since the first visit. |
| `emb.user_session_part_index` | 1-indexed within the user session. |
| `emb.user_session_start_ts` | Milliseconds since Unix epoch. |
| `emb.user_session_max_duration_seconds` | Whole seconds, frozen at session creation. |
| `emb.user_session_inactivity_timeout_seconds` | Whole seconds, frozen at session creation. |
| `emb.properties.*` | All properties at part-start time. |

### Stamped at session-part end

| Attribute | Condition |
| --- | --- |
| `emb.session_part_end_reason` | Always. One of `SessionPartEndReason`. |
| `emb.sdk_startup_duration` | Always. Milliseconds, ceiled. |
| `emb.is_final_session_part = 1` | Only when ending due to user-session end. |
| `emb.user_session_termination_reason` | Only when ending due to user-session end. |
| `emb.properties.*` | Refreshed from storage to capture cross-tab writes. |
| `emb.app.applied_limit.*` | Diagnostic counts from the limit manager. |
| Counter keys | From `_activeSessionPartCounts`, populated by instrumentations. |

### Stamped on every other span

Nothing. Non-part spans are correlated server-side via the batched envelope
emitted by `EmbraceSessionBatchedSpanProcessor`, not by per-span ID stamping.

### Stamped on log records

`IdentifiableSessionLogRecordProcessor` writes the same set as spans, plus
`log.record.uid` (a fresh UUID per record).

## Known gaps

### Cold-load orphan window

`emb.session_part_id` ships as `''` on telemetry produced between SDK init
and the first session-part start. The user-session id is populated; only
the part id is empty.

Why it happens:

1. `setTracerProvider` materializes the user-session state via
   `_loadOrCreateUserSessionState`, so `getUserSessionId()` returns a real
   id immediately.
2. `initSDK` calls `startSessionPartInternal('init')` next, but the call
   no-ops when `!document.hasFocus()` or `visibilityState === 'background'`
   (parts are foreground-only by design).
3. Until the next engagement event fires (`pageshow`/`focus`/
   `visibilitychange`), `_activeSessionPartId === null`. Logs that pass
   through `IdentifiableSessionLogRecordProcessor` in that window end up
   with `emb.session_part_id: ''`. Spans are not affected; only the
   session-part span itself carries IDs, and other spans are correlated
   server-side via the batched envelope.

How to reproduce: open the demo in a non-focused tab (or under headless
Playwright). The vite dev server stamps `Server-Timing` headers on every
served file; `ServerTimingInstrumentation` turns each into an
`emb-server-timing` log. The log batch flushed when the first user
interaction finally promotes the tab to engaged carries `emb.user_session_id`
but `emb.session_part_id=''`, while subsequent batches in the same
collector flush carry a real part id.

The wire contract still holds (key is always present; `''` means "no part
active"), so this is not a serialization bug. Open question whether to
relax the engagement gate for the very first `'init'` part so cold-load
telemetry gets a real part id.
