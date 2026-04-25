# User sessions and session parts

The SDK exposes a **user session** as the top-level grouping of telemetry and a
**session part** as a contiguous interval of user activity within a user
session. The public `UserSessionManager` API (exposed via the `session`
singleton) covers the user session; session parts are an SDK-internal concept
that maps to an OTel span (`emb-session`) with `emb.type = ux.session_part`.

## Lifecycle

- A part begins on SDK init, when the tab returns to visible after being
  hidden, when user input resumes after an inactivity-killed part, or as a
  rollover after `endUserSession()` / max-duration expiry.
- A part ends on `visibilitychange` to hidden, on max-duration expiry, on
  `endUserSession()`, or when the part-inactivity window elapses with no user
  input during an active part (web-specific, see below).
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
   state.inactivityDeadlineTs = part_end_ts + state.inactivityTimeoutMs
   (state.inactivityTimeoutMs is locked at user-session creation time;
    no JS timer; persisted to localStorage)
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
  final part of the user session (max duration, inactivity, manual); omitted
  otherwise.
- `emb.user_session_termination_reason`: one of `manual` or
  `max_duration_reached` when the part is final; omitted otherwise. The spec
  also names `inactivity`, but the web SDK's inactivity detection is lazy
  (spec §1.1): the deadline is recorded at part end and the user session is
  declared expired only when the next part tries to start. The prior part's
  span is already ended by that point, so this attribute is not written for
  inactivity-driven rollovers.

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

Only `endUserSession()` is exposed for lifecycle control (spec §1.4). Starting
a new user session is an internal consequence of the next part; there is no
`startUserSession` API.
