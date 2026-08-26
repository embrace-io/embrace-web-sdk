# Performance Manager

`OTelPerformanceManager` is the SDK's internal clock. Every instrumentation
receives an instance through `EmbraceInstrumentationBase` (as `this.perf`) and
uses it to turn raw browser timing values into span timestamps, log timestamps,
and timing attributes.

This document explains the two reference frames the SDK deals with, which
method converts between them, and how each instrumentation maps onto them.

## Two reference frames

Every timing value the SDK handles lives in one of two frames:

- **Time origin.** `performance.timeOrigin` is the epoch timestamp of the
  original hard navigation. It is fixed for the entire life of the page. Every time value from the Performance API is a [DOMHighResTimeStamp](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/High_precision_timing#domhighrestimestamp) defined as *milliseconds since time origin*.
- **Zero time.** The SDK's own concept: the moment the user started viewing
  what is currently on screen. It starts equal to time origin and moves
  forward on:
  - **prerendering activation** — `activationStart` from the navigation entry;
  - **bfcache restore** — the `pageshow` event;
  - **soft navigation** — the Navigation API's `currententrychange` event
    (same-URL replacements, e.g. framework hydration via
    `history.replaceState`, are ignored).

  The `pageshow` and `currententrychange` listeners are wired up in
  `initSDK.ts` and feed `updateZeroTimeMillis()`; `getZeroTime()` combines
  them with `activationStart` by taking the latest reset point.

The frames answer different questions. Time origin is for *"what wall-clock
time did this event happen at"*; zero time is for *"how far into the current
view did this event happen"*. Mixing them up produces timestamps shifted by
the gap between the two frames, or durations measured from the wrong starting
line.

## The API

| Method | Question it answers | Computation |
| --- | --- | --- |
| `epochMillisFromOrigin(offset)` | What wall-clock epoch time does this raw offset correspond to? | `timeOrigin + offset` |
| `getZeroTime()` | What is the epoch timestamp of the current view's start? | `max(timeOrigin + activationStart, lastResetEpoch)` |
| `millisFromZeroTime(offset)` | How many ms after the current view started did this raw offset occur? | `max(0, offset - (getZeroTime() - timeOrigin))` |
| `getNowMillis()` | What is the wall-clock epoch time right now? | `timeOrigin + performance.now()` |

Zero time never participates in converting a raw offset to an epoch: the
offset already contains the full distance from time origin, so
`epochMillisFromOrigin` is a pure frame translation. Adding a raw offset to
`getZeroTime()` instead would count the origin→zero-time gap twice.

**Durations need no conversion at all.** `entry.duration`, or any difference
of two offsets in the same frame (`responseEnd - fetchStart`), is
origin-independent — the origins cancel. Values like these are recorded as-is
without touching `perf`.

## Worked example

Timeline (times shown as wall clock for readability):

| Wall clock | Event | Values |
| --- | --- | --- |
| 12:00:00.000 | Hard navigation | `timeOrigin = 1,700,000,000,000` |
| 12:01:00.000 | User soft-navigates to `/checkout` | zero time resets to `1,700,000,060,000` |
| 12:01:01.000 | Checkout hero image finishes rendering | the browser reports `entry.renderTime = 61,000` — still measured from time origin; the soft navigation does not reset the browser's clock |
| 12:01:01.500 | SDK processes the entry and emits telemetry | — |

Each method, applied to this scenario:

| Call | Result | What it's for here |
| --- | --- | --- |
| `epochMillisFromOrigin(61_000)` | `1,700,000,061,000` (12:01:01.000) | the span **end** — the real instant the render happened |
| `getZeroTime()` | `1,700,000,060,000` (12:01:00.000) | the span **start** — anchoring the span to the current view's start so its duration reads "time from view start until render" |
| `millisFromZeroTime(61_000)` | `61,000 - 60,000 = 1,000` | the `render_time` **attribute** — "rendered 1s into the current view" |
| `getNowMillis()` | `1,700,000,061,500` (12:01:01.500) | the default **log timestamp** when there is no event-specific offset to convert |

The resulting span: start `12:01:00`, end `12:01:01`, duration **1s**, with a
`render_time` attribute of **1,000ms** — all four numbers telling the same
story.

The two ways to get this wrong, with the same inputs:

- Recording the raw `61,000` as the attribute claims the render took **61s**,
  because it silently measures from the original hard navigation. Across a
  long single-page-app visit this number grows without bound.
- Computing the epoch as `getZeroTime() + 61,000` yields
  `1,700,000,121,000` (12:02:01) — one full minute in the future, because the
  60s origin→zero-time gap got counted twice.

## Instrumentation catalog

Instrumentations fall into three groups, by which frame their telemetry
relates to.

### Zero-time instrumentations

These emit at least one value measured from zero time — they exist to describe
the user's experience of the *current view*, so their timing attributes rebase
onto it.

#### ElementTimingInstrumentation

One span per `element` timing entry.

| Telemetry field | Source | Method |
| --- | --- | --- |
| span start | — (artificial anchor: "view start") | `getZeroTime()` |
| span end | `entry.startTime` | `epochMillisFromOrigin` |
| `load` span event | `entry.loadTime` | `epochMillisFromOrigin` |
| `emb.element_timing.render_time` | `entry.renderTime` | `millisFromZeroTime` |
| `emb.element_timing.load_time` | `entry.loadTime` | `millisFromZeroTime` |
| `emb.element_timing.start_time` | `entry.startTime` | `millisFromZeroTime` |

#### UserTimingInstrumentation

One span per `performance.measure()`, one log per `performance.mark()`.

| Telemetry field | Source | Method |
| --- | --- | --- |
| measure span start / end | `entry.startTime` (+ `entry.duration`) | `epochMillisFromOrigin` |
| mark log timestamp | `entry.startTime` | `epochMillisFromOrigin` |
| `emb.user_timing.start_time` | `entry.startTime` | `millisFromZeroTime` |
| `emb.user_timing.duration` | `entry.duration` | none — pure duration |

#### SoftNavigationPerformanceInstrumentation

One span per `soft-navigation` timing entry.

| Telemetry field | Source | Method |
| --- | --- | --- |
| span start / end | `entry.startTime` (+ `entry.duration`) | `epochMillisFromOrigin` |
| `emb.soft_navigation.start_time` | `entry.startTime` | `millisFromZeroTime` |
| `emb.soft_navigation.paint_time` | `entry.paintTime` | `millisFromZeroTime` |
| `emb.soft_navigation.presentation_time` | `entry.presentationTime` | `millisFromZeroTime` |
| `emb.soft_navigation.duration` | `entry.duration` | none — pure duration |

#### FirstInteractionInstrumentation

One log for the first click/keydown/scroll per session part.

| Telemetry field | Source | Method |
| --- | --- | --- |
| log timestamp | `event.timeStamp` | `epochMillisFromOrigin` |
| `emb.first_interaction.time` | `event.timeStamp` | `millisFromZeroTime` |

### Time-origin instrumentations

These only convert raw offsets into absolute epoch timestamps. They carry no
"time since view start" values, either because none is meaningful for them or
because the measurement is inherently about the original hard navigation.

#### ClicksInstrumentation

`click` span events on the active session-part span. Event time:
`event.timeStamp` via `epochMillisFromOrigin`. Other attributes
(element name, coordinates) are not timing values.

#### RageClickInstrumentation

One log per detected rage click. Log timestamp: the first click's
`event.timeStamp` via `epochMillisFromOrigin`. Other attributes
(count, element, x/y) are not timing values.

#### GlobalExceptionInstrumentation

One exception log per uncaught error / unhandled rejection. Log timestamp:
`event.timeStamp` via `epochMillisFromOrigin` in both handlers.

#### WebVitalsInstrumentation

One log per web-vital report.

| Telemetry field | Source | Method |
| --- | --- | --- |
| log timestamp (INP) | `attribution.interactionTime` | `epochMillisFromOrigin` |
| log timestamp (CLS) | earliest `entries[].startTime` — the layout shift window's start (fallback: `attribution.largestShiftTime`) | `epochMillisFromOrigin` |
| log timestamp (TTFB) | — (the moment the user started viewing the current view) | `getZeroTime()` |
| log timestamp (LCP / FCP) | last `entries[].startTime` | `epochMillisFromOrigin` |
| log timestamp (no entries) | — | `getNowMillis()` at emission |
| `browser.web_vital.value` / `.delta` | computed by the `web-vitals` library | none — see below |
| TTFB sub-part attributes (`redirect`, `domainLookup`, `tcpConnection`, `tlsNegotiation`, `serverResponse`, `unattributed`) | differences of `PerformanceNavigationTiming` fields | none — pure durations |
| raw attribution body (`includeRawAttribution`) | `metric.attribution` primitives, verbatim | none — intentionally a raw debug dump |

`metric.value` for time-based vitals is "time since navigation start" as
computed by the upstream `web-vitals` library, which has its own bfcache
handling (each restore counts as a fresh page visit) independent of the SDK's
zero time. Note that standard vitals (LCP, FCP, TTFB) do not re-report on a
*soft* navigation at all — only CLS (cumulative) and INP (per-interaction)
keep reporting through a soft-navigated visit. That is an upstream library
boundary, not something the SDK's zero time influences.

#### DocumentLoadInstrumentation

Document-load, document-fetch, and per-resource spans, once per hard page
load. Zero time is intentionally not involved: this measurement is by
definition about the original hard navigation, and there is no "current view"
concept for a one-time page-load report.

| Telemetry field | Source | Method |
| --- | --- | --- |
| span start (all three span kinds) | `fetchStart` | `epochMillisFromOrigin` |
| span end | `responseEnd` / `loadEventEnd` | `epochMillisFromOrigin` |
| `firstPaint` / `firstContentfulPaint` span events | paint entry `startTime` | `epochMillisFromOrigin` |
| network span events (`domainLookupStart`, `connectStart`, `responseStart`, …) | navigation/resource timing fields | none — raw offsets inside upstream helpers, see below |

The network events are added by `@opentelemetry/sdk-trace-web`'s
`addSpanNetworkEvent(s)` helpers, which pass raw offsets to `span.addEvent`
with no conversion hook. OTel normalizes those internally: any plain number
below `performance.timeOrigin / 2` is treated as an offset and gets
`performance.timeOrigin` added (see `timeInputToHrTime` in
`@opentelemetry/core`), so the recorded timestamps come out the same as an
explicit conversion. The SDK converts explicitly everywhere it controls the
call, because the heuristic is a magnitude guess — it reads the ambient global
clock rather than the injected `PerformanceClock`, and it misclassifies values
in environments where the global time origin is small (faked test clocks).
Anyone replacing the upstream helpers with converting versions should keep the
zero-checks on the *raw* values: `0` is a sentinel for "did not happen" (e.g.
`secureConnectionStart` on plain-HTTP connections), and converting it first
would fabricate events at exactly time origin.

### Instrumentations outside both frames

These handle no origin-relative offsets at all — only pure durations,
non-timing data, or OTel's default "now".

| Instrumentation | Timing data it emits |
| --- | --- |
| ServerTimingInstrumentation | `emb.server_timing.duration` — a duration reported by the server, frame-independent |
| LoafInstrumentation | aggregated long-animation-frame durations (sums, maxima) — pure durations |
| MaxScrollDepthInstrumentation | none — pixels, percent, booleans |
| DOMStateInstrumentation | counts and pixels, plus one `getNowMillis()` read that pins the held view snapshot's log timestamp to the capture moment rather than to the session-part-end flush that sends it. Also reads `getNavigationEntry()` for `loadEventStart`, used only as a fired/not-fired predicate, never emitted |
| EmptyRootInstrumentation | none — span event uses OTel's default "now" |
| NavigationInstrumentation | route spans start/end at OTel's default "now", which is genuinely when the route change occurs |

## Managers and internals

For completeness, the non-instrumentation consumers of the clock:

- **EmbraceLogManager** — `getNowMillis()` as the default `timestamp` for
  `log()` / `logException()` when the caller does not supply one.
- **EmbraceUserSessionManager** — `getNowMillis()` for user-session and
  session-part lifecycle timestamps (part span start/end, breadcrumb events,
  rollover boundaries). These are genuinely "now" — the lifecycle event *is*
  the current instant, not a raw offset in need of conversion.
- **RetryingTransport** — `getNowMillis()` twice to compute a retry deadline
  and the remaining timeout. Internal duration math, not telemetry.
- **initSDK** — `getNowMillis()` difference for `emb.sdk_startup_duration`
  (a pure duration), plus the `pageshow` / `currententrychange` listeners
  that reset zero time. It also stamps `emb.sdk_init_timestamp` from
  `getNowMillis()` and converts `SDK_LOAD_ORIGIN_OFFSET_MILLIS` into
  `emb.sdk_load_timestamp` via `epochMillisFromOrigin`. Both are time-origin
  values: they say when SDK machinery ran, not what the user perceived, so
  they must not shift on a bfcache restore or soft navigation.
- **`utils/sdkLoadTime.ts`** — the one deliberate exception to routing clock
  reads through this manager. It captures `performance.now()` at module
  evaluation, earlier than any manager instance can exist, and holds the raw
  origin offset so the conversion still happens here.
