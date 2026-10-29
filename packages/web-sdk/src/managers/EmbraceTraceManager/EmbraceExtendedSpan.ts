import type {
  Attributes,
  AttributeValue,
  Context,
  Exception,
  Link,
  Span,
  SpanContext,
  SpanOptions,
  SpanStatus,
  TimeInput,
  Tracer,
} from '@opentelemetry/api';
import { isTimeInput } from '@opentelemetry/core';
import type {
  ExtendedSpan,
  ExtendedSpanFailedOptions,
} from '../../api-traces/index.ts';
import {
  KEY_EMB_ERROR_CODE,
  KEY_EMB_PERF_CLOCK_LAG_DELTA_MS,
} from '../../constants/index.ts';
import type { AbsoluteTime, PerformanceManager } from '../../utils/index.ts';
import { DRIFT_THRESHOLD_MS } from '../../utils/index.ts';

// TODO: review once https://github.com/open-telemetry/opentelemetry-js/issues/7217 is closed
/**
 * Converts a performance.now()-based span time into epoch milliseconds, anchored to wallOrigin, the
 * time origin as the wall clock saw it when the span was created, as OTel would. That keeps it in
 * line with the span's Date.now() start and end. The SDK clock's conversion is used instead when it
 * lands more than the drift threshold away, which means the machine slept between the time and the
 * span's creation. Epoch numbers, Dates and HrTimes are kept as given.
 */
const toSpanTime = (
  perf: PerformanceManager,
  wallOrigin: AbsoluteTime,
  time: TimeInput | undefined,
): TimeInput | undefined => {
  // A number up to the current offset is performance.now()-based, as OTel reads it
  if (typeof time !== 'number' || time > perf.getOffsetFromOrigin()) {
    return time;
  }

  const anchoredTime = wallOrigin + time;
  const correctedAbsoluteTime = perf.offsetToAbsoluteTime(time);

  // If the difference between anchoredTime and correctedAbsoluteTime is the expected error between Date.now() and performance.now()
  // keep anchoredTime, otherwise assume there's a sleep and use correctedAbsoluteTime
  return Math.abs(correctedAbsoluteTime - anchoredTime) > DRIFT_THRESHOLD_MS
    ? correctedAbsoluteTime
    : anchoredTime;
};

/**
 * Delegates most calls to the Span it wraps, so that it satisfies the Span interface.
 * It also implements the helpers that are part of the ExtendedSpan interface. For a span started
 * through `start`, it converts the times given to `end`, `fail`, `addEvent` and `recordException`
 * the same way as the start, and `end` and `fail` set emb.perf_clock_lag_delta_ms to the time slept
 * since the span started.
 */
export class EmbraceExtendedSpan implements ExtendedSpan {
  private readonly _span: ExtendedSpan;
  // Set only by start(): a span wrapped by from() has no wall origin from its creation, so its
  // times are kept as given and it gets no emb.perf_clock_lag_delta_ms
  private readonly _perf?: PerformanceManager;
  // Stores Date.now() - performance.now() when the span is created
  // so all offsets are anchored to the same difference
  // We need to store this in case any external instrumentation uses Date.now() as startTime instead of our own SDK clock
  private readonly _wallOrigin?: AbsoluteTime;

  private constructor(
    span: Span,
    perf?: PerformanceManager,
    wallOrigin?: AbsoluteTime,
  ) {
    this._span = span as ExtendedSpan;
    this._perf = perf;
    this._wallOrigin = wallOrigin;
  }

  /**
   * Starts a span on the given tracer, converting its start time with `toSpanTime`.
   */
  public static start(
    tracer: Tracer,
    perf: PerformanceManager,
    name: string,
    options: SpanOptions = {},
    ctx?: Context,
  ): EmbraceExtendedSpan {
    const wallOrigin = Date.now() - perf.getOffsetFromOrigin();
    const span = tracer.startSpan(
      name,
      {
        ...options,
        // OTel's own default, passed explicitly: without a start time OTel ends the span and stamps
        // its events at start + elapsed performance.now(), which leaves out time asleep, and with
        // one at Date.now().
        startTime:
          toSpanTime(perf, wallOrigin, options.startTime) ?? Date.now(),
      },
      ctx,
    );

    return new EmbraceExtendedSpan(span, perf, wallOrigin);
  }

  /**
   * Returns the span itself when it is already an EmbraceExtendedSpan, as spans started through
   * EmbraceTracerProvider are, and wraps it otherwise.
   */
  public static from(span: Span): EmbraceExtendedSpan {
    return span instanceof EmbraceExtendedSpan
      ? span
      : new EmbraceExtendedSpan(span);
  }

  /**
   * Expose attributes by extending OpenTelemetry's ReadableSpan.
   */
  public get attributes(): Attributes {
    return this._span.attributes;
  }

  public addEvent(
    name: string,
    attributesOrStartTime?: Attributes | TimeInput,
    startTime?: TimeInput,
  ): this {
    this._span.addEvent(
      name,
      isTimeInput(attributesOrStartTime)
        ? this._toSpanTime(attributesOrStartTime)
        : attributesOrStartTime,
      this._toSpanTime(startTime),
    );
    return this;
  }

  public addLink(link: Link): this {
    this._span.addLink(link);
    return this;
  }

  public addLinks(links: Link[]): this {
    this._span.addLinks(links);
    return this;
  }

  public end(endTime?: TimeInput): void {
    this._end(endTime);
  }

  public isRecording(): boolean {
    return this._span.isRecording();
  }

  public recordException(exception: Exception, time?: TimeInput): void {
    this._span.recordException(exception, this._toSpanTime(time));
  }

  public setAttribute(key: string, value: AttributeValue): this {
    this._span.setAttribute(key, value);
    return this;
  }

  public setAttributes(attributes: Attributes): this {
    this._span.setAttributes(attributes);
    return this;
  }

  public removeAttribute(key: string): this {
    const { [key]: _, ...attributes } = this._span.attributes;
    // @ts-expect-error Read/write spans are allowed per the spec https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/sdk.md#additional-span-interfaces
    this._span.attributes = attributes;
    return this;
  }

  public setStatus(status: SpanStatus): this {
    this._span.setStatus(status);
    return this;
  }

  public spanContext(): SpanContext {
    return this._span.spanContext();
  }

  public updateName(name: string): this {
    this._span.updateName(name);
    return this;
  }

  public fail(
    options: ExtendedSpanFailedOptions = {
      code: 'failure',
    },
  ): void {
    if (options.code) {
      this._span.setAttribute(KEY_EMB_ERROR_CODE, options.code.toUpperCase());
    }

    this._end(options.endTime);
  }

  private _end(endTime: TimeInput | undefined): void {
    // A span that has ended, or isn't sampled and so has no attributes, is left as it is
    if (this._perf && this._wallOrigin !== undefined && this.isRecording()) {
      // Written directly, as PerfClockLagSpanProcessor writes emb.perf_clock_lag_ms, so the
      // attribute count limit doesn't drop it
      this._span.attributes[KEY_EMB_PERF_CLOCK_LAG_DELTA_MS] =
        this._perf.getClockLag(this._wallOrigin);
    }

    this._span.end(this._toSpanTime(endTime));
  }

  private _toSpanTime(time: TimeInput | undefined): TimeInput | undefined {
    if (!this._perf || this._wallOrigin === undefined) {
      return time;
    }
    return toSpanTime(this._perf, this._wallOrigin, time);
  }
}
