# Performance Manager

`OTelPerformanceManager` is the SDK's internal clock. Every instrumentation
receives an instance through `EmbraceInstrumentationBase` (as `this.perf`) and
uses it to turn raw browser timing values into span timestamps, log timestamps,
and timing attributes.

This document explains the two reference frames the SDK deals with, which
method converts between them, how the clock copes with the machine sleeping,
and how each instrumentation maps onto them.

## Two reference frames

Every timing value the SDK handles is in one of two frames:

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

  The `pageshow` listener in `initSDK.ts` and the `currententrychange`
  listener in `EmbracePageManager` feed `setZeroTimeOffset(event.timeStamp)`.
  Zero time is stored as that perf offset, and combined with `activationStart`
  by taking the latest reset point.

The frames answer different questions. Time origin is for *"what wall-clock
time did this event happen at"*; zero time is for *"how far into the current
view did this event happen"*. Mixing them up produces timestamps shifted by
the gap between the two frames, or durations measured from the wrong starting
line.

## The API

The signatures in `types.ts` name the two kinds of value: `AbsoluteTime` is
epoch milliseconds on the wall clock, and `Offset` is milliseconds on the perf
clock since time origin, or since zero time for `getOffsetFromZeroTime`. Only
an offset from time origin can be passed to `offsetToAbsoluteTime`.

`origin(t)` below is the origin in effect at perf offset `t`. It is
`timeOrigin` until the machine sleeps; see
[Sleep and the origin history](#sleep-and-the-origin-history).

| Method | Question it answers | Computation |
| --- | --- | --- |
| `offsetToAbsoluteTime(offset, entryStart = offset)` | What wall-clock epoch time does this raw offset correspond to? | `origin(entryStart) + offset` |
| `getZeroTime(entryStart = zeroOffset)` | What is the epoch timestamp of the current view's start? | `origin(entryStart) + zeroOffset`, where `zeroOffset = max(activationStart, lastResetOffset)` |
| `getOffsetFromOrigin()` | What is the raw offset right now? | `performance.now()` |
| `getOffsetFromZeroTime(offset = now)` | How many ms after the current view started did this raw offset occur? | `max(0, offset - zeroOffset)` |
| `getNow()` | What is the wall-clock epoch time right now? | `origin(now) + performance.now()` |
| `getClockLag(origin?)` | How far behind `Date.now()` is the uncorrected perf clock? | `round(Date.now() - (origin + performance.now()))`, with `origin` defaulting to `timeOrigin` as read at startup |
| `setZeroTimeOffset(offset)` | — (records the raw offset at which the current view started) | |
| `checkDrift()` | — (starts a new origin segment if the machine slept) | |

Zero time never participates in converting a raw offset to an epoch: the
offset already contains the full distance from time origin, so
`offsetToAbsoluteTime` is a pure frame translation. Adding a raw offset to
`getZeroTime()` instead would count the origin→zero-time gap twice.

`getOffsetFromZeroTime` only takes a raw offset still relative to time origin
(`entry.startTime`, `event.timeStamp`), or nothing to measure up to now. Passing it an
epoch value (`getNow()`, `offsetToAbsoluteTime(...)`) counts the origin
twice — see the worked example below.

When converting several timings of one entry, pass the entry's `startTime` as
`entryStart` for each of them. They then share one origin and keep the
entry's duration, even if a sleep falls in the middle of it.

Durations need no conversion at all. `entry.duration`, or any difference
of two offsets in the same frame (`responseEnd - fetchStart`), is
origin-independent — the origins cancel. Values like these are recorded as-is
without touching `perf`.

## Sleep and the origin history

On macOS, Linux, Android and iOS, `performance.now()` stops while the machine
sleeps, but `Date.now()` keeps real time. In a tab that stays open across a
sleep, `timeOrigin + performance.now()` falls behind the wall clock by the
time slept. Left alone, that stamps everything after the sleep hours in the
past, and keeps user sessions alive because their expiry checks never see the
time go by. `emb.perf_clock_lag_ms` records the size of that lag, and
`emb.perf_clock_lag_delta_ms` how much of it built up while a span was open.

The manager keeps an origin history: a list of `{ from, origin }` segments
that starts as `{ from: 0, origin: timeOrigin }`. Every read runs
`checkDrift()`, which compares the current origin plus `performance.now()`
with `Date.now()`. When they disagree by more than 1s in either direction, it
pushes `{ from: lastCheckedNow, origin: Date.now() - performance.now() }`:

- Offsets up to `from` (the last check, when the clocks still agreed) are
  known to predate the sleep, and keep the old origin.
- Offsets after it get the new, wall-clock-anchored origin. The sleep happened
  somewhere between the two checks. When the second check runs does not
  matter, but the first should be just before the sleep, so `initSDK` also
  calls `checkDrift()` on `blur`, which came before every sleep in testing,
  and on `visibilitychange`, for a page that was already hidden.

The history is capped at 100 segments. The first one is always kept, so
document load entries keep `timeOrigin`.

What follows from this:

- **Timestamps** (`getNow`, `offsetToAbsoluteTime`, `getZeroTime`)
  follow the wall clock, so a wall-clock change also moves them.
- **Durations** from the browser (`entry.duration`) and `getOffsetFromZeroTime`
  are pure perf differences, so they leave out time asleep. A difference of
  two `getNow()` reads includes any time asleep or wall-clock correction
  between them, which is what a retry deadline wants, and is negligible for a
  synchronous measurement like SDK startup.
- **`timeOrigin` is read once.** Safari moves `performance.timeOrigin` forward
  by the time asleep, which keeps `timeOrigin + performance.now()` on the wall
  clock while `performance.now()` itself stops. The manager reads `timeOrigin`
  when the clock state is created and measures drift and `getClockLag()`
  against that value. Reading it fresh would hide the drift, and stamp entries
  from before a sleep late by the whole sleep.
- **The state belongs to the clock.** The SDK builds several managers on
  `window.performance` (initSDK's, plus one per instrumentation that isn't
  handed one), so the origin history and zero time are kept per clock, not per
  manager, and every manager on the same clock agrees on them.
- **Spans and logs get their times through the SDK's providers**, described
  below. Never pass `timeOrigin + performance.now()` or OTel's `hrTime()`:
  both read as epoch values and get no correction.

### Spans

OTel fills in a span's missing end and event times differently depending on
whether the span was started with a start time. Both spans below start at the
same instant with the same value; only that flag differs:

```ts
const a = tracer.startSpan('a');                             // no start time
const b = tracer.startSpan('b', { startTime: Date.now() });  // the same value, passed explicitly
// 3s awake, then 30 min asleep, then 5s awake
a.end();
b.end();
```

| Span | Start | `end()` with no time | Duration |
| --- | --- | --- | --- |
| `a` | `Date.now()` (10:00:00), not marked as given | start + elapsed `performance.now()` = 10:00:08 | 8s |
| `b` | `Date.now()` (10:00:00), marked as given | `Date.now()` = 10:30:08 | 30m 8s |

A raw `performance.now()` offset passed as `startTime` or to `end()` or
`addEvent()` is converted by OTel as `timeOrigin + offset` plus the lag
measured when the span was created. That is right unless a sleep falls between
the offset and the span's creation.

`EmbraceTracerProvider` starts every span through `EmbraceExtendedSpan.start()`,
which handles both:

- **No start time:** it passes `Date.now()`, the value OTel would use, so every
  span behaves like `b`.
- **Offsets:** it converts them itself, in the start and in `end()`, `fail()`,
  `addEvent()` and `recordException()`. Each is anchored to the wall clock as of
  the span's creation (`Date.now() - getOffsetFromOrigin()` then), which lines
  it up exactly with the span's `Date.now()` values. When
  `offsetToAbsoluteTime()` lands more than the 1s threshold away from that, a
  sleep separates the offset from the span's creation, and the origin history's
  value is used instead.
- **Epoch numbers, `Date`s and `HrTime`s** are kept as given.

Spans default to `Date.now()` rather than `getNow()` because their other end is
usually `Date.now()`: OTel's default end once a start is given, and the explicit
end of the fetch and XHR instrumentations. A `getNow()` start would put the
drift between the two clocks into the duration.

### Logs

OTel stamps a log without a timestamp with `Date.now()`. That includes time
asleep, but can be up to the 1s threshold away from the SDK clock, so a log
flushed at a session part's end could land after the part's recorded end. A
number below `timeOrigin / 2` is read as `performance.now()`-based and converted
as `timeOrigin + t` with no correction: after a sleep it is early by all the
time asleep on Chrome and Firefox, and late on Safari for values from before
the sleep.

`EmbraceLoggerProvider` fills in the timestamp before OTel sees it:

- **No timestamp:** `getNow()`. A log is a single point, which only needs to
  line up with the session part it belongs to.
- **A number below `timeOrigin / 2`:** `offsetToAbsoluteTime()`.
- **Epoch numbers, `Date`s and `HrTime`s** are kept as given.

Both providers serve the SDK's managers, every instrumentation and, when the
SDK registers globally, the OTel logs and trace APIs. Spans and logs
from any other provider keep OTel's behavior.

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
| `offsetToAbsoluteTime(61_000)` | `1,700,000,061,000` (12:01:01.000) | the span **end** — the real instant the render happened |
| `getZeroTime()` | `1,700,000,060,000` (12:01:00.000) | the span **start** — anchoring the span to the current view's start so its duration is "time from view start until render" |
| `getOffsetFromZeroTime(61_000)` | `61,000 - 60,000 = 1,000` | the `render_time` **attribute** — "rendered 1s into the current view" |
| `getNow()` | `1,700,000,061,500` (12:01:01.500) | the default **log timestamp** when there is no event-specific offset to convert |
| `getOffsetFromZeroTime()` | `61,500 - 60,000 = 1,500` | an attribute capturing "how far into the view is it right now" |

The resulting span: start `12:01:00`, end `12:01:01`, duration **1s**, with a
`render_time` attribute of **1,000ms** — all four numbers agree.

The three ways to get this wrong, with the same inputs:

- Recording the raw `61,000` as the attribute claims the render took **61s**,
  because it silently measures from the original hard navigation. Across a
  long single-page-app visit this number grows without bound.
- Computing the epoch as `getZeroTime() + 61,000` yields
  `1,700,000,121,000` (12:02:01) — one full minute in the future, because the
  60s origin→zero-time gap got counted twice.
- Computing `getOffsetFromZeroTime(getNow())` yields
  `1,700,000,061,500 - 60,000 = 1,700,000,001,500` — still trillion-scale,
  because `getNow()` already has `timeOrigin` added in and
  `getOffsetFromZeroTime` subtracts assuming it doesn't. Call
  `getOffsetFromZeroTime()` with no offset instead.

## Worked example: sleep

A tab on Chrome or Firefox, where `performance.now()` stops while the machine
sleeps:

| Wall clock | `performance.now()` | Event |
| --- | --- | --- |
| 12:00:00.000 | 0 | Hard navigation: `timeOrigin = 1,700,000,000,000` |
| 12:10:00.000 | 600,000 | `log.message('before sleep')`: log A, no timestamp |
| 12:10:01.000 | 601,000 | `trace.startSpan('upload')`: span S, no start time |
| 12:10:03.000 | 603,000 | `blur` as the machine goes to sleep: the session part ends, and `checkDrift()` finds the clocks in agreement |
| 12:10:03 – 12:40:03 | 603,000 | Asleep for 30 min: the perf clock does not advance |
| 12:40:03.000 | 603,000 | Wake: `focus` starts a new session part, whose start reads `getNow()`. Its `checkDrift()` sees a 30 min gap and adds the segment `{ from: 603,000, origin: 1,700,001,800,000 }` |
| 12:40:05.000 | 605,000 | `span.addEvent('retry', performance.now())` |
| 12:40:08.000 | 608,000 | `span.end()`, no time |
| 12:40:10.000 | 610,000 | `log.message('after sleep')`: log B, no timestamp |

What each one gets:

| Signal | How it is converted | Result |
| --- | --- | --- |
| Log A | `EmbraceLoggerProvider`: no timestamp, so `getNow()` = `timeOrigin + 600,000` | `1,700,000,600,000` (12:10:00.000) |
| Span S start | `EmbraceExtendedSpan.start()`: no start time, so `Date.now()`, marked as given. It also records `wallOrigin = Date.now() - performance.now()` = `1,700,000,000,000` | `1,700,000,601,000` (12:10:01.000) |
| `retry` event | `wallOrigin + 605,000` is 12:10:05.000, while `offsetToAbsoluteTime(605,000)` uses the new segment, `1,700,001,800,000 + 605,000`. They differ by 30 min, more than the 1s threshold, so the second is used | `1,700,002,405,000` (12:40:05.000) |
| Span S end | `end()` with no time: the start was given, so OTel uses `Date.now()` | `1,700,002,408,000` (12:40:08.000) |
| Log B | `getNow()` = new origin `+ 610,000` | `1,700,002,410,000` (12:40:10.000) |

The span starts at 12:10:01 and ends at 12:40:08, a duration of **30m 7s**
that includes the time asleep, with its `retry` event at 12:40:05, between the
wake and the end. Its `emb.perf_clock_lag_delta_ms` is `1,800,000`, the 30 min
asleep, so the 7s it was awake is the duration minus that. Logs A and B land on either side of the sleep, at the times
they were emitted. On Safari, which moves `performance.timeOrigin` forward
instead, the results are the same: the manager reads `timeOrigin` once, and
`wallOrigin` does not use it.

The ways to get this wrong, with the same inputs:

- **Starting the span on a plain OTel tracer.** It starts at the same
  12:10:01, but without a start time marked as given, so `end()` lands at the
  start plus 7s of `performance.now()`: 12:10:08. The span reports **7s** and
  ends half an hour before it did.
- **The same `addEvent('retry', performance.now())` on a plain OTel span.**
  OTel converts the offset with the lag measured when the span was created,
  before the sleep: 12:10:05, half an hour early, before the sleep it came
  after.
- **Stamping log B with `timeOrigin + performance.now()`** (or OTel's
  `hrTime()`): `1,700,000,610,000` (12:10:10), half an hour early, before the
  sleep it came after.

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
| span start | — (artificial anchor: "view start") | `getZeroTime(entry.startTime)` |
| span end | `entry.startTime` | `offsetToAbsoluteTime` |
| `load` span event | `entry.loadTime` | `offsetToAbsoluteTime(entry.loadTime, entry.startTime)` |
| `emb.element_timing.render_time` | `entry.renderTime` | `getOffsetFromZeroTime` |
| `emb.element_timing.load_time` | `entry.loadTime` | `getOffsetFromZeroTime` |
| `emb.element_timing.start_time` | `entry.startTime` | `getOffsetFromZeroTime` |

#### UserTimingInstrumentation

One span per `performance.measure()`, one log per `performance.mark()`.

| Telemetry field | Source | Method |
| --- | --- | --- |
| measure span start / end | `entry.startTime` (+ `entry.duration`) | `offsetToAbsoluteTime`, end with `entry.startTime` as `entryStart` |
| mark log timestamp | `entry.startTime` | `offsetToAbsoluteTime` |
| `emb.user_timing.start_time` | `entry.startTime` | `getOffsetFromZeroTime` |
| `emb.user_timing.duration` | `entry.duration` | none — pure duration |

#### SoftNavigationPerformanceInstrumentation

One span per `soft-navigation` timing entry.

| Telemetry field | Source | Method |
| --- | --- | --- |
| span start / end | `entry.startTime` (+ `entry.duration`) | `offsetToAbsoluteTime`, end with `entry.startTime` as `entryStart` |
| `emb.soft_navigation.start_time` | `entry.startTime` | `getOffsetFromZeroTime` |
| `emb.soft_navigation.paint_time` | `entry.paintTime` | `getOffsetFromZeroTime` |
| `emb.soft_navigation.presentation_time` | `entry.presentationTime` | `getOffsetFromZeroTime` |
| `emb.soft_navigation.duration` | `entry.duration` | none — pure duration |

#### FirstInteractionInstrumentation

One log for the first click/keydown/scroll per session part.

| Telemetry field | Source | Method |
| --- | --- | --- |
| log timestamp | `event.timeStamp` | `offsetToAbsoluteTime` |
| `emb.first_interaction.time` | `event.timeStamp` | `getOffsetFromZeroTime` |

#### DOMStateInstrumentation

One `dom-state` log per session part end.

| Telemetry field | Source | Method |
| --- | --- | --- |
| `dom_state.images_above_fold.timestamp` | — (the moment the fold measurement is taken) | `getNow()` |
| `dom_state.images_above_fold.capture_time` | — (the same moment) | `getOffsetFromZeroTime()` |

Both attributes are read back-to-back at fold-capture time and held until the session-part-end flush that actually sends the log —
one as wall clock, one rebased onto zero time. The log's own timestamp is
untouched by this: it is `getNow()` at the flush, since the log's
other attributes (element count, average depth, document box) are only
measured at that later point, not at the earlier capture. Everything else is
counts and pixels, not timing data. `getNavigationEntry()` is also read for
`loadEventStart`, used only as a fired/not-fired predicate, never emitted.

### Time-origin instrumentations

These only convert raw offsets into absolute epoch timestamps. They have no
"time since view start" values, either because none is meaningful for them or
because the measurement is inherently about the original hard navigation.

#### ClicksInstrumentation

`click` span events on the active session-part span. Event time:
`event.timeStamp` via `offsetToAbsoluteTime`. Other attributes
(element name, coordinates) are not timing values.

#### RageClickInstrumentation

One log per detected rage click. Log timestamp: the first click's
`event.timeStamp` via `offsetToAbsoluteTime`. Other attributes
(count, element, x/y) are not timing values.

#### GlobalExceptionInstrumentation

One exception log per uncaught error / unhandled rejection. Log timestamp:
`event.timeStamp` via `offsetToAbsoluteTime` in both handlers.

#### WebVitalsInstrumentation

One log per web-vital report.

| Telemetry field | Source | Method |
| --- | --- | --- |
| log timestamp (INP) | `attribution.interactionTime` | `offsetToAbsoluteTime` |
| log timestamp (CLS) | earliest `entries[].startTime` — the layout shift window's start (fallback: `attribution.largestShiftTime`) | `offsetToAbsoluteTime` |
| log timestamp (TTFB) | — (the moment the user started viewing the current view) | `getZeroTime()` |
| log timestamp (LCP / FCP) | last `entries[].startTime` | `offsetToAbsoluteTime` |
| log timestamp (no entries) | — | `getNow()` at emission |
| `browser.web_vital.value` / `.delta` | computed by the `web-vitals` library | none — see below |
| TTFB sub-part attributes (`redirect`, `domainLookup`, `tcpConnection`, `tlsNegotiation`, `serverResponse`, `unattributed`) | differences of `PerformanceNavigationTiming` fields | none — pure durations |
| raw attribution body (`includeRawAttribution`) | `metric.attribution` primitives, verbatim | none — intentionally a raw debug dump |

`metric.value` for time-based vitals is "time since navigation start" as
computed by the upstream `web-vitals` library, which has its own bfcache
handling (each restore counts as a fresh page visit) independent of the SDK's
zero time. Standard vitals (LCP, FCP, TTFB) do not re-report on a
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
| span start (all three span kinds) | `fetchStart` | `offsetToAbsoluteTime` |
| span end | `responseEnd` / `loadEventEnd` | `offsetToAbsoluteTime` |
| `firstPaint` / `firstContentfulPaint` span events | paint entry `startTime` | `offsetToAbsoluteTime` |
| network span events (`domainLookupStart`, `connectStart`, `responseStart`, …) | navigation/resource timing fields | `offsetToAbsoluteTime`, see below |

The document-load `addSpanNetworkEvent(s)` helpers check for zero on the *raw*
offset before converting: `0` means the mark did not happen or is hidden (e.g.
`unloadEventStart` with no prior document, or network marks on opaque
cross-origin resources), and converting it first would fabricate an event at
exactly time origin. Navigation entries start at time origin, so their zero
marks are real and kept, except `secureConnectionStart`, where `0` means no
TLS handshake.

Do not pass raw offsets to `span.addEvent` and rely on the span to normalize
them. A number at or below `performance.now()` is anchored to `Date.now()` as of
the span's creation (see `EmbraceTracerProvider` below). Span start and end are
converted explicitly and never get that anchoring, so raw-offset events would
drift out of their own span's bounds.

### Instrumentations outside both frames

These handle no origin-relative offsets at all — only pure durations,
non-timing data, or "now". Their logs carry no timestamp, so
`EmbraceLoggerProvider` stamps them with `getNow()` rather than OTel's default
`Date.now()`, which can be up to the 1s drift threshold away from the session
part's recorded end.

| Instrumentation | Timing data it emits |
| --- | --- |
| ServerTimingInstrumentation | `emb.server_timing.duration` — a duration reported by the server, frame-independent; log timestamp `getNow()` |
| LoafInstrumentation | aggregated long-animation-frame durations (sums, maxima) — pure durations; both logs' timestamps `getNow()` |
| MaxScrollDepthInstrumentation | log timestamp `getNow()`; otherwise pixels, percent, booleans |
| EmptyRootInstrumentation | none — span event uses OTel's default "now" |
| NavigationInstrumentation | route spans start/end at `getNow()`, which is genuinely when the route change occurs |

## Managers and internals

For completeness, the non-instrumentation consumers of the clock:

- **EmbraceLoggerProvider** — the SDK's `LoggerProvider`: the log manager,
  every instrumentation and, when the SDK registers globally, the OTel logs API
  get their loggers from it. A log without a timestamp gets `getNow()`. A
  number below `performance.timeOrigin / 2`, OTel's own cut-off for a
  `performance.now()`-based value, goes through `offsetToAbsoluteTime()`.
  Epoch numbers, `Date`s and `HrTime`s are kept as given.
- **EmbraceUserSessionManager** — `getNow()` for user-session and
  session-part lifecycle timestamps (part span start/end, breadcrumb events,
  rollover boundaries). These are genuinely "now" — the lifecycle event *is*
  the current instant, not a raw offset in need of conversion. The part span
  start is passed explicitly, so a part starts and ends on the same clock.
- **EmbraceTracerProvider** — the SDK's `TracerProvider`: the trace manager,
  the user session manager, every instrumentation and, when the SDK registers
  globally, the OTel trace API get their tracers from it. Spans come back as
  `EmbraceExtendedSpan`, which converts the times given to `end()`, `fail()`,
  `addEvent()` and `recordException()` the same way as the start.
  - `end()` and `fail()` set `emb.perf_clock_lag_delta_ms` to `getClockLag()`
    measured from the span's wall origin (`Date.now() - getOffsetFromOrigin()`
    at its creation), the time slept since then. A span created and ended at
    once with earlier times, as from a performance entry, gets 0 even if the
    entry spanned a sleep.
  - A span without a start time gets `Date.now()`, passed explicitly. Without
    one, OTel ends the span and stamps its events at its start plus the elapsed
    `performance.now()`, which leaves out time asleep. With one, at `Date.now()`.
  - A `performance.now()`-based time (a number up to `getOffsetFromOrigin()`)
    is anchored to the wall clock as of the span's creation,
    `Date.now() - getOffsetFromOrigin()` then, as OTel would. That keeps it in
    line with the span's `Date.now()` start and end. It goes through
    `offsetToAbsoluteTime()` instead when that lands more than the drift
    threshold away, which means the machine slept between the time and the
    span's creation.
  - Epoch numbers, `Date`s and `HrTime`s are kept as given.
- **RetryingTransport** — `getNow()` twice to compute a retry
  deadline and the remaining timeout. Internal duration math, not telemetry.
- **initSDK** — `getNow()` difference for `emb.sdk_startup_duration`
  (a pure duration), the `pageshow` listener that resets zero time, and the
  `blur` and `visibilitychange` listeners that call `checkDrift()`.
- **PerfClockLagSpanProcessor / PerfClockLagLogRecordProcessor** —
  `getClockLag()` for `emb.perf_clock_lag_ms`. It counts every sleep since
  the page loaded, including those before the span or log.
