# User Session Manager

`EmbraceUserSessionManager` is the source of truth for user-session and
session-part state across all tabs in this browser.

This document describes the model, the observable behavior, and the stable
contracts: public API, emitted attributes, storage keys, and configuration.
It deliberately avoids naming private methods or walking through internal
algorithms, which drift as the implementation evolves. Read the source for
those.

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

The `UserSessionManager` interface exposes the following methods.

### Active

| Method | Behavior |
| --- | --- |
| `getUserSessionId()` | Returns the current user session UUID or `null`. |
| `getPreviousUserSessionId()` | Returns the prior user session UUID or `null`. |
| `getUserSessionStartTime()` | Returns wall-clock milliseconds since Unix epoch, or `null`. |
| `endUserSession()` | Ends the current user session. Subject to a 5 second cooldown. No-op if no user session is active. If no session part is active when called, the user session ends silently because there is no part span to carry the termination reason. |
| `addBreadcrumb(name)` | Adds an `emb-breadcrumb` event to the active session-part span. Dropped if no part is active. |
| `addProperty(key, value, options?)` | Stores a key-value pair. `lifespan: 'permanent'` writes to the `embrace_permanent_properties` blob and survives user-session boundaries. Without `lifespan`, the entry lives inside the user-session state row and is cleared on user-session end. Safe to call before the first session part starts; the call eagerly creates a user-session row so the value is stamped on the part span when it begins. |
| `removeProperty(key)` | Removes the key from all stores. If a session part is active, also removes the corresponding span attribute. |

### Deprecated forwarders

These exist for source compatibility with the prior API. Some forward to the
current equivalents; others are inert (return `null` or no-op).

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

`UserSessionManagerInternal` extends the public interface with members used by
instrumentations and processors inside the SDK only: driving the session-part
lifecycle (start and end), reading the active part id and span, incrementing
per-part counters, subscribing to part start/end, and wiring the tracer
provider (required before the first part). Customer code only ever sees
`UserSessionManager`.

The SDK init flow also reports the measured startup duration once; the value
is stamped as `emb.sdk_startup_duration` on every session-part end span.

## Session-part lifecycle

### Start

A session part starts only when the tab is engaged at call time, meaning
**both** of the following are true:

- `document.visibilityState === 'visible'`
- `document.hasFocus()` returns `true`

A start request while a part is already active is a warn-level no-op. A request
while the tab is not engaged is a debug-level no-op. Parts are foreground-only
by design.

### Start triggers

`SessionPartStartReason` enumerates every reason a session part can begin:

| Value | Trigger |
| --- | --- |
| `init` | SDK init flow on page load. |
| `web_foreground` | `visibilitychange` to visible or `focus` while no part is active and the tab is engaged. Also covers the BFCache restore path. |
| `web_activity` | `keydown`, `mousedown`, `mousemove`, or `scroll` while no part is active and the tab is engaged. Subject to the 30 second activity throttle. |
| `web_soft_nav` | A soft navigation rolled the active part over, starting the next part in the same user session. Stamped on the new part. |
| `user_session_rollover` | Begins the next user session's first part immediately after a user session ends. |

### End triggers

`SessionPartEndReason` enumerates every reason a session part can end:

| Value | Trigger |
| --- | --- |
| `web_background` | `visibilitychange` to hidden or `blur`. Also covers hard-nav unload and BFCache freeze, since blur or an earlier `visibilitychange` to hidden ends the part before `pagehide` fires. |
| `web_foreground_inactivity` | The foreground part-inactivity timer (`userSessionForegroundInactivityTimeoutSeconds`, default 30 minutes) fires without any user input event resetting it. |
| `web_soft_nav` | A soft navigation rolled the active part over. Not a final reason: the enclosing user session continues and a new part starts immediately. |
| `user_session_ended` | The active part is ended as part of a user-session rollover, triggered by manual `endUserSession()` or max-duration expiry. |

The part-level `web_foreground_inactivity` is distinct from the user-session-level `inactivity` reason in the [`UserSessionEndReason`](#termination) table below: when the part-inactivity timer fires it stamps `web_foreground_inactivity` as the part end reason and `inactivity` as the enclosing user session's termination reason on the same final part span.

### End behavior

On end, the manager refreshes user-session-scoped properties from storage to
capture cross-tab writes, builds the end attributes, and applies them to the
part span before ending it. A throwing attribute write is isolated from the
span end, so a poisoned property value cannot prevent the span from ending.
Part-end subscribers are notified.

If the end reason is not final (in practice `web_background`), the user session
continues: an inactivity deadline of
`now + userSessionInactivityTimeoutSeconds * 1000` is written into the state
blob, computed from the actual call time rather than any anchored span-end
timestamp, so an anchored part end cannot shorten the inactivity window. The
max-duration deadline is fixed at creation and keeps running, so it is not
re-armed.

When the end reason is final (`user_session_ended` or `web_foreground_inactivity`)
the final part span is additionally stamped `emb.is_final_session_part = 1` and,
when a `userSessionEndReason` is supplied, `emb.user_session_termination_reason`.

## User-session lifecycle

### Creation

User-session creation is lazy. No user-session object exists between
`endUserSession()` and the next engaged part start. On that start the manager
reads the stored state; if it is missing or expired it records the prior id as
the previous-session link and mints a fresh user session. It then advances the
within-session part index and the cross-visit part-number counter
(`embrace_session_part_number`), marks a part active, persists the state, and
arms the max-duration timer.

### Expiry

A stored user session is treated as expired when any of the following holds:

- The clock jumped backwards (`now` is before the recorded start timestamp).
- The max-duration boundary has passed.
- An inactivity deadline was recorded at the last part end and has elapsed.

There is no live timer for the inactivity window. The deadline is checked at
the next part start. A part span that has already been exported never
retroactively receives `emb.is_final_session_part`.

### Termination

A user session ends and immediately attempts to start a part for the next one.
This happens on a manual `endUserSession()` (reason `manual`) and when the
max-duration timer fires (reason `max_duration_reached`).

The part-inactivity path ends a user session differently: it ends the active
part directly with the `inactivity` termination reason rather than going
through a rollover.

`UserSessionEndReason` defines all possible values:

| Value | Trigger | Emitted by web SDK |
| --- | --- | --- |
| `manual` | `endUserSession()` API call. | Yes |
| `max_duration_reached` | Max-duration timer fires. | Yes |
| `inactivity` | Part-inactivity timer fires while a part is active. | Yes, stamped as the user-session termination reason on the final part span, paired with that part's `web_foreground_inactivity` end reason. When inactivity is instead detected lazily at the next part start (no part was active to run the timer), the prior part span has already been exported, so no reason is stamped. |

On rollover the manager samples one boundary timestamp, ends the active part as
final with that timestamp, clears the stored user session, and starts the next
part with the same timestamp so the two part spans tile without a gap. The
follow-up start mints a fresh user session if the tab is still engaged, or
silently no-ops if not (the next engagement event will create it).

## Timers

| Timer | Constant | Default | Range | Effect on fire |
| --- | --- | --- | --- | --- |
| Max duration | `DEFAULT_USER_SESSION_MAX_DURATION_SECONDS` | 12 hours | `MIN_USER_SESSION_MAX_DURATION_SECONDS` (1h) to `MAX_USER_SESSION_MAX_DURATION_SECONDS` (24h) | Ends the user session and rolls into the next (`max_duration_reached`). |
| User-session inactivity (lazy) | `DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS` | 30 minutes | `MIN_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS` (30s) to `MAX_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS` (24h) | Not a live timer. Stored as `userSessionInactivityTimeoutSeconds`; at part end the manager records `now + userSessionInactivityTimeoutSeconds * 1000` as the inactivity deadline (from the actual call time, not the anchored span end), checked on the next part start. |
| Part (foreground) inactivity | `DEFAULT_USER_SESSION_FOREGROUND_INACTIVITY_TIMEOUT_SECONDS` | 30 minutes | `MIN_USER_SESSION_FOREGROUND_INACTIVITY_TIMEOUT_SECONDS` (30s) to `MAX_USER_SESSION_FOREGROUND_INACTIVITY_TIMEOUT_SECONDS` (24h) | Live `setTimeout` armed from `userSessionForegroundInactivityTimeoutSeconds` while a part is active; on fire it ends the part (`web_foreground_inactivity`) and the enclosing user session (`inactivity`). |
| Activity throttle | `ACTIVITY_THROTTLE_MS` | 30 seconds | n/a | At most one inactivity-timer reset per 30 seconds of input. |
| `endUserSession` cooldown | `END_USER_SESSION_COOLDOWN_MS` | 5 seconds | n/a | Calls within 5 seconds of the last call are silently ignored. |

`userSessionMaxDurationSeconds`, `userSessionInactivityTimeoutSeconds`, and
`userSessionForegroundInactivityTimeoutSeconds` are driven by remote config
(`DynamicConfigManager.getConfig()`), read at each user-session creation. Each
value is clamped to its own range; out-of-range values fall back to their
default and emit a warning. In addition, each inactivity timeout must be `<=`
`userSessionMaxDurationSeconds`; if remote config violates that, the offending
timeout falls back to its **default**, not to the max-duration value.
`userSessionForegroundInactivityTimeoutSeconds` drives the live part timer.
`userSessionInactivityTimeoutSeconds` drives the lazy post-part-end deadline.

The max-duration timer is armed at user-session creation, and re-armed when a
fresh manager loads an existing, unexpired state on page reload (no timer
running yet). It is not re-armed on session-part end; `userSessionMaxEndTs` is
fixed at creation, so it keeps running across parts on its original deadline.
The delay is computed as the time remaining until that deadline, not the full
duration value.

The part-inactivity timer is restarted on every activity event, subject to the
30 second throttle, and cleared on session-part end.

## Storage

### Keys

| Key | Contents | Lifetime |
| --- | --- | --- |
| `embrace_user_session_state` | JSON-serialized `UserSessionState` (id, previous id, start ts, max-end ts, numbers, durations, deadline, properties) | Cleared when the user session ends (final part end, or rollover with no active part). Written on every part start, every part end (to update `inactivityDeadlineTs`), and on every user-session-scoped `addProperty` / `removeProperty` call while a user session exists. |
| `embrace_user_session_number` | Monotonic integer string. | Persisted across visits. Only ever incremented. |
| `embrace_session_part_number` | Monotonic integer string. | Persisted across visits. Bumped at every session-part start. |
| `emb.properties.<key>` | String value. | Persisted across visits. Survives user-session boundaries. |

`userSessionMaxDurationSeconds`, `userSessionInactivityTimeoutSeconds`, and `userSessionForegroundInactivityTimeoutSeconds` are frozen into the state blob at
session creation. A remote-config change does not affect a user session already
in progress. It takes effect when the next user session is created. To keep the
cached config current, the manager fires a remote-config refresh whenever it
creates a new user session (except on cold start, where `initSDK` already
refreshes at startup). That fetch is async, so its result lands in the cache for
the following user session rather than the one being created.

### Failure handling

`NamespacedStorage` wraps `localStorage` access. The first `setItem` throw flips
a sticky write-disabled flag, logs one error, and silently no-ops further
writes. `getItem` and `removeItem` keep trying.

The manager treats its in-memory state as locally authoritative: every mutating
call (`addProperty`, `removeProperty`, lifecycle bookkeeping) updates memory
first and then persists best-effort. Failed writes are not rolled back, so the
local tab continues to see and stamp every value it set even after storage goes
read-only. Cross-tab visibility is the cost: a write that never reaches disk is
invisible to other tabs.

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
listeners. The class-level doc comment on `EmbraceUserSessionManager` records
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

If a tab dies mid-part without ending its part, the state blob remains in
storage with `inactivityDeadlineTs = null`. The next tab to engage reads this
state. Because the deadline is null and the max-duration boundary has not
necessarily passed, the dead tab's user session is continued. Abrupt tab close
is by design not a user-session boundary.

### Cross-tab safety hardening

Several specific edge cases are handled:

- Part finalization isolates a throwing `setAttributes` call from the span end,
  so a poisoned permanent-property value cannot drop the part span from the
  export.
- A peer tab that learns about a user-session rollover never stamps the dying
  tab's inactivity deadline onto the new user session's storage row. This is
  structural rather than active: the engagement gate guarantees the peer tab
  has no active part at the moment of rollover, so its part-end bookkeeping
  cannot race with the wipe. The peer's stale max-duration timer is cleared
  lazily, on its next part start. If the stale timer fires first, the rollover
  it triggers runs benignly against the already-cleared storage row.

## Unload and BFCache handling

There is no BFCache-specific code in the manager and no `pagehide`/`pageshow`
listener. Behavior is absorbed by the engagement-transition events the manager
already listens to (`blur`, `focus`, `visibilitychange`), per the HTML
[unload a document][unload-spec] algorithm and the event ordering observed in
the browsers below:

- **Active-tab unload** (hard nav OR BFCache freeze). On a focus-shifting nav
  (address-bar typing, omnibox suggestion), `blur` fires first while
  `visibilityState` is still `'visible'` and ends the part as `web_background`.
  On a programmatic `location.href` nav, no `blur` fires; instead `pagehide`
  and `visibilitychange` to hidden fire in the same task at navigation commit,
  and the `visibilitychange` listener ends the part as `web_background`. In
  both cases the part is ended before any `pagehide` handler could run.
- **Backgrounded-tab unload**. `visibilitychange` to hidden already fired
  earlier (when the user switched away), ending the part as `web_background`
  at that moment. The later `pagehide` is on an already-ended part.
- **BFCache restore**. Per the spec, `focus` and `visibilitychange` to
  `'visible'` fire before `pageshow`. The combined visible+focused transition
  starts a new part as `web_foreground`; `pageshow` would be redundant. This
  path is spec-derived rather than empirically verified here because Playwright
  suppresses BFCache (`pageshow.persisted` is always `false` on `goBack()`).

The in-memory state survives the freeze-restore cycle because BFCache
preserves the JS heap.

### Verified event ordering

Verified 2026-05 on macOS under Chromium 148, Firefox 150, and WebKit 26.4.
On a plain `location.href` hard nav, all three engines fire `beforeunload`,
then `pagehide` (with `visibilityState='visible'`, `hasFocus=true`,
`persisted=false`), then `visibilitychange` to `hidden`, all within the same
task. `pagehide` and `visibilitychange` share a `performance.now()` timestamp,
with `pagehide` ordered first per the HTML spec's unload steps.

No `blur` fires in any engine for the programmatic `location.href` case.
`blur` is observed on the active-tab path only when the navigation itself
shifts focus out of the document (URL bar typing, alt-tab away, click into
another window).

[unload-spec]: https://html.spec.whatwg.org/multipage/document-lifecycle.html#unload-a-document

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
| `emb.user_session_foreground_inactivity_timeout_seconds` | Whole seconds, frozen at session creation. |
| `emb.properties.*` | All properties at part-start time. |

### Stamped at session-part end

| Attribute | Condition |
| --- | --- |
| `emb.session_part_end_reason` | Always. One of `SessionPartEndReason`. |
| `emb.sdk_startup_duration` | Always. Milliseconds, ceiled. |
| `emb.is_final_session_part = 1` | When the end reason is final (`user_session_ended` or `web_foreground_inactivity`). |
| `emb.user_session_termination_reason` | When the end reason is final and a `userSessionEndReason` was passed (both final paths pass one). |
| `emb.properties.*` | Refreshed from storage to capture cross-tab writes. |
| `emb.app.applied_limit.*` | Diagnostic counts from the limit manager. |
| Counter keys | Per-part counts populated by instrumentations. |

### Stamped on every other span

Nothing. Non-part spans are correlated server-side via the batched envelope
emitted by `EmbraceSessionPartBatchedSpanProcessor`, not by per-span ID stamping.

### Stamped on log records

`UserSessionLogRecordProcessor` writes the same set as spans, plus
`log.record.uid` (a fresh UUID per record).

## Known gaps

### Cold-load orphan window

`emb.session_part_id` ships as `''` on telemetry produced between SDK init
and the first session-part start. The user-session id is populated; only
the part id is empty.

Why it happens:

1. Wiring the tracer provider materializes the user-session state, so
   `getUserSessionId()` returns a real id immediately.
2. The init flow then requests an `'init'` part, but that request no-ops when
   the tab is not engaged (`!document.hasFocus()` or
   `visibilityState === 'hidden'`), because parts are foreground-only by design.
3. Until the next engagement event fires (`focus`/`visibilitychange`), no part
   is active. Logs that pass through `UserSessionLogRecordProcessor` in that
   window end up with `emb.session_part_id: ''`. Spans are not affected; only
   the session-part span itself carries IDs, and other spans are correlated
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
