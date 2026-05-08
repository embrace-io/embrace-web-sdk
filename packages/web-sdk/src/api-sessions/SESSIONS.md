# User sessions and session parts

The SDK exposes a **user session** as the top-level grouping of telemetry and a
**session part** as a contiguous interval of user activity within a user
session. The public `UserSessionManager` API (exposed via the `session`
singleton) covers the user session; session parts are an SDK-internal concept
that maps to an OTel span (`emb-session`) with `emb.type = ux.session_part`.

## Lifecycle

- A part begins on any engagement signal that finds the tab without an
  active part: SDK init, `focus`, `visibilitychange` to visible, `pageshow`
  (BFCache restore), input resumed after an inactivity-killed part, or a
  rollover after `endUserSession()` / max-duration expiry.
- A part ends on any disengagement signal: `visibilitychange` to hidden,
  `blur`, `pagehide` (tab close, BFCache eviction, mobile-browser
  backgrounding), max-duration expiry, `endUserSession()`, or when the
  part-inactivity window elapses with no user input during an active part
  (web-specific, see below).
- A user session spans one or more parts. It ends when:
  - `endUserSession()` is called (rate-limited to 5 s per spec §1.4),
  - the configured max duration elapses (spec §1.3),
  - the configured inactivity timeout has passed since the last part ended, as
    detected lazily on the next part start (spec §1.1), or
  - the device clock jumps backwards before `userSessionStartTs` (spec §6.1).

## Inactivity: two layers

There are two distinct inactivity mechanisms; the user-facing word
`inactivity` covers both.

| Layer | Where | Detection | Default | Default constant |
|---|---|---|---|---|
| Part-inactivity (web-specific, eager) | `SessionPartActivityInstrumentation` | JS timer, reset on each input event | 30 min | `PART_INACTIVITY_TIMEOUT_MS` |
| User-session inactivity (spec §1.1, lazy) | `EmbraceUserSessionManager` | Deadline written at part end, checked at next part start | 30 min | `DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_MS` |

The two interact in sequence when a user walks away:

```
foreground part active
|--- part-inactivity timer (30 min) ---|
                                       |
                                       v
                            _onPartInactivity()
                                       |
                                       v
            endSessionPartInternal('inactivity')
                                       |
                                       v
            EmbraceUserSessionManager.onSessionPartEnd()
                                       |
                                       v
   localStorage[<inactivity-deadline-key>] = part_end_ts + state.inactivityTimeoutMs
   (state.inactivityTimeoutMs is locked at user-session creation time;
    no JS timer; the deadline is written to its OWN localStorage key
    rather than folded into the state row, so this part-end write
    cannot clobber a peer tab's pn bump in the state row)
                                       |
            ... time passes; no SDK code runs ...
                                       |
                       user returns; new part attempts to start
                                       |
                                       v
            EmbraceUserSessionManager.onSessionPartStart()
                                       |
                                       v
                          _isExpired(state, now)
                            |                            |
                       true: end user session,    false: clear deadline,
                       start a new one            increment partNumber
```

The part-inactivity layer is implemented as the `inactivity` reason on
`emb.session_part_end_reason`. The user-session-inactivity layer is the spec
§1.1 TMO. The web SDK does not stamp
`emb.user_session_termination_reason='inactivity'` because the prior part's
span is already finalized by the time the lazy check fires; there is no part
span left to carry the attribute.

## Part activity handling (web-specific)

When input resumes while no part is active, the SDK starts a new part with
reason `activity`. That new part's `onSessionPartStart` runs the same lazy
TMO check as any other part start, so the user session rolls or continues
according to the usual max-duration and inactivity-timeout rules.

Tab visibility is also handled here: on `visibilitychange` to hidden the
active part ends with reason `visibility_change`. On the return to visible,
a new part starts with reason `visibility_change`.

Both behaviors are implemented by `SessionPartActivityInstrumentation`,
registered unconditionally by `setupDefaultInstrumentations`. It has no config
surface and is not guarded by the `omit` set; the session part lifecycle
depends on it.

At most one tab has an active part at any time: engagement requires both
`visibilityState === 'visible'` and `hasFocus()`, so a hidden or unfocused tab
cannot keep a part open. When focus moves between tabs, the previously
focused tab ends its part on `blur` / `visibilitychange` and the newly
focused tab starts a new one. User-session state lives in `localStorage`, so
the user session itself continues across that handoff.

## Attributes

See `managers/EmbraceUserSessionManager/types.ts` for the authoritative
attribute list and units.

Keys emitted on **every** span and log regardless of whether a session part is
active (empty string when the corresponding value is unavailable):

- `session.id` (OTel standard): equals the user session UUID by default and is
  user-overridable via `setSessionId()`. Per-span / per-log values take
  precedence.
- `session.previous_id` (OTel standard): equals the previous user session UUID.
  Per-span / per-log values take precedence.
- `emb.user_session_id`: user session UUID; SDK-owned, always overwritten.
- `emb.user_session_previous_id`: previous user session UUID; SDK-owned.

Key emitted on spans and logs produced while a session part is active:

- `emb.session_part_id`: session part UUID.

Keys emitted only on the session-part span:

- `emb.user_session_number`: 1-indexed, monotonic across the SDK's install
  lifetime.
- `emb.user_session_part_number`: 1-indexed within the user session.
- `emb.user_session_start_ts`: milliseconds since the Unix epoch.
- `emb.user_session_max_duration_seconds`,
  `emb.user_session_inactivity_timeout_seconds`: whole seconds.
- `emb.session_part_start_reason`: one of `init`, `visibility_change`,
  `activity`, `user_session_rollover`.
- `emb.session_part_end_reason`: one of `manual`, `visibility_change`,
  `inactivity`, `user_session_ended`.
- `emb.is_final_session_part`: numeric `1` when the SDK knows this is the
  final part of the user session (max duration, manual `endUserSession()`,
  or a cross-tab termination cascade); omitted otherwise. **Not** stamped
  on inactivity-driven rollovers: the prior part's span is already
  finalized by the time the lazy inactivity check fires, so there is no
  span left to carry the attribute.
- `emb.user_session_termination_reason`: one of `manual` or
  `max_duration_reached` when the part is final; omitted otherwise. The spec
  also names `inactivity`, but the web SDK's inactivity detection is lazy
  (spec §1.1): the deadline is recorded at part end and the user session is
  declared expired only when the next part tries to start. The prior part's
  span is already ended by that point, so this attribute is not written for
  inactivity-driven rollovers. Web-SDK extension: `storage_corrupted` is
  emitted on peer tabs when their cross-tab cascade was triggered by another
  tab discarding corrupt JSON in the shared state key, so the cascade is
  attributable in telemetry instead of appearing as an unknown peer end.

## Configuration (spec §3)

Values are supplied at SDK init:
`initSDK({ userSessionConfig: { maxDurationSeconds, inactivityTimeoutSeconds } })`.

- Defaults: max duration = 43200 s (12 h), inactivity timeout = 1800 s (30 m).
- Allowed ranges: max duration ∈ [1 h, 24 h], inactivity timeout ∈ [30 s,
  24 h], inactivity timeout ≤ max duration. Out-of-range values fall back to
  defaults (if `inactivity_timeout > max_duration`, only the inactivity
  timeout is reset; max duration is kept).
- Values lock at user-session creation time and do not change mid-session;
  a config change takes effect on the next user session.

## Spec deviations

- **§4 ordering:** the spec requires parts be transmitted in generation order.
  The web SDK cannot honor this strictly; the retry transport may deliver
  later parts before earlier ones. Consumers must sort by timestamp. Use the
  part span's start time and `emb.user_session_start_ts` (ms since epoch) for
  deterministic assembly.
- **§5 reason value enums:** the spec names `emb.session_part_start_reason`
  and `emb.session_part_end_reason` but does not define values. The SDK emits
  the enums listed above, each mapped 1:1 to a code path.
- **Universal session IDs:** the spec limits `session.id` / `emb.user_session_id`
  to records tied to a session part (§2.1). The web SDK stamps `session.id`,
  `session.previous_id`, `emb.user_session_id`, and `emb.user_session_previous_id`
  on every span and log, using empty strings when a current / previous session
  is not available. `session.previous_id` exists in the OTel semantic
  convention and a pointer to the prior user session is useful for backend
  stitching. User-set `session.id` / `session.previous_id` values are
  respected.
- **Foreground-only on web:** §1.2 allows SDKs to emit background parts. A
  part corresponds to a focused tab; the web SDK never starts or keeps a part
  alive while the tab is not engaged. A tab is "engaged" only when
  `document.visibilityState === 'visible'` AND `document.hasFocus()` is true.
  `startSessionPart` is a no-op when either condition fails, and either
  `visibilitychange` to hidden or `blur` ends the active part immediately
  with reason `visibility_change`. If a max-duration rollover fires while
  the tab is not engaged, the old user session ends but the new part's start
  is deferred until the tab becomes engaged again.
- **Remote configuration (§3):** the spec's `user_session.max_duration_seconds`
  and `user_session.inactivity_timeout_seconds` remote config keys are not yet
  wired into the web SDK's dynamic config pipeline. Values can only be set via
  `initSDK({ userSessionConfig })`.

## Public API

The `session` singleton (a `UserSessionManager`) exposes a user-session-level
surface only. Session parts are an SDK-internal implementation detail and have
no public methods or accessors.

**Identity**

- `getUserSessionId()`, `getPreviousUserSessionId()`
- `getUserSessionStartTime()` (ms since epoch)

**Lifecycle**

- `endUserSession()` ends the current user session (rate-limited to 5 s per
  spec §1.4). Starting a new user session is an internal consequence of the
  next part; there is no `startUserSession` API.

**Identity override**

- `setSessionId(id | null)` overrides `session.id` on every span and log.
  Pass `null` to clear the override. `emb.user_session_id` is unaffected.
  Per-span / per-log values still take precedence over this override.
- The override is **sticky**: once set, it remains in effect across user-session
  boundaries (max-duration rollover, manual `endUserSession()`, cross-tab
  termination) until the customer explicitly calls `setSessionId(null)` or
  replaces it with another value. While unset, `session.id` mirrors
  `emb.user_session_id` and tracks its lifecycle.
- Must be called after `initSDK` returns. Calls made on the proxy before the
  SDK initializes are dropped silently.

**Listeners**

- `addUserSessionStartedListener(listener)`, `addUserSessionEndedListener(listener)`
  fire on user-session boundaries (max-duration rollover, manual end, lazy
  inactivity rollover). Listeners must not synchronously call back into
  `endUserSession()`; the inner call is rejected with a diag warning.

**Properties and breadcrumbs**

- `addBreadcrumb(name)` records a span event on the active part span. If no
  part is active, the breadcrumb is dropped.
- `addProperty(key, value, options?)` stores a property that travels with
  every part within the current user session.
  - Default: in-memory, cleared on user-session end.
  - `options.lifespan === 'permanent'`: also written to localStorage and
    reapplied across user sessions until explicitly removed. If localStorage
    is unavailable (Safari private mode, quota exceeded), the value falls
    back to the in-memory user-session map: it survives the current user
    session but does not persist across user-session boundaries. A
    `diag.error` (id `EMB_STORAGE_003`) is emitted on the fallback.
  - Safe to call before any part is active; the value is queued and applied
    on the next part start.
- `removeProperty(key)` clears the value from both stores (in-memory map and
  localStorage) and from the active part span if present.

### Deprecated API (kept as forwarders)

The following names from prior SDK versions still exist on `session` but are
deprecated:

- `getSessionId`, `getPreviousSessionId` → forward to `getUserSessionId` /
  `getPreviousUserSessionId`.
- `getSessionStartTime` → forwards to `getUserSessionStartTime` and converts
  ms to OTel `HrTime` (`[seconds, nanoseconds]`); prefer the
  millisecond-valued replacement.
- `endSessionSpan` → forwards to `endUserSession`.
- `startSessionSpan` → no-op. Per spec §1.4 there is no public start API; the
  next foreground session part begins a new user session implicitly.
- `getSessionSpan` → returns `null` (the part span is not part of the public
  API).

**Behavior change**: `addSessionStartedListener` and `addSessionEndedListener`
forward to `addUserSessionStartedListener` and `addUserSessionEndedListener`,
which fire on **user-session** boundaries (default 12 h or `endUserSession()`).
In prior versions these fired on every foreground-visibility transition. There
is no replacement for the per-foreground-interval semantics.
