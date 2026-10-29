import type { Tracer } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import {
  AlwaysOffSampler,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  StackContextManager,
} from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { OTelPerformanceManager } from '../../utils/index.ts';
import { EmbraceExtendedSpan } from './EmbraceExtendedSpan.ts';
import { EmbraceTraceManager } from './EmbraceTraceManager.ts';
import { EmbraceTracerProvider } from './EmbraceTracerProvider.ts';

const { expect } = chai;

const TIME_ORIGIN = 1_700_000_000_000;
const THIRTY_MINUTES = 30 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

const toMillis = (span: ReadableSpan) => ({
  start: hrTimeToMilliseconds(span.startTime),
  end: hrTimeToMilliseconds(span.endTime),
  events: span.events.map((event) => hrTimeToMilliseconds(event.time)),
});

describe('EmbraceTracerProvider', () => {
  let perfNow: number;
  let clock: sinon.SinonFakeTimers;
  let perf: OTelPerformanceManager;
  let exporter: InMemorySpanExporter;
  let provider: EmbraceTracerProvider;
  let tracer: Tracer;

  // The perf clock only advances while the machine is awake; Date.now() always does
  const advanceAwake = (ms: number) => {
    perfNow += ms;
    clock.tick(ms);
  };
  const sleep = (ms: number) => {
    clock.tick(ms);
  };

  beforeEach(() => {
    perfNow = 10_000;
    clock = sinon.useFakeTimers({
      now: TIME_ORIGIN + perfNow,
      toFake: ['Date'],
    });
    context.setGlobalContextManager(new StackContextManager().enable());

    perf = new OTelPerformanceManager({
      now: () => perfNow,
      timeOrigin: TIME_ORIGIN,
    });
    exporter = new InMemorySpanExporter();
    provider = new EmbraceTracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
      perf,
    });
    tracer = provider.getTracer('test');
  });

  afterEach(() => {
    context.disable();
    clock.restore();
  });

  it('ends a span started without a start time on the wall clock after a sleep', () => {
    const span = tracer.startSpan('no-start-time');
    advanceAwake(3000);
    sleep(THIRTY_MINUTES);
    advanceAwake(5000);
    span.addEvent('after-wake');
    span.end();

    const [finished] = exporter.getFinishedSpans();
    expect(toMillis(finished)).to.deep.equal({
      start: TIME_ORIGIN + 10_000,
      end: TIME_ORIGIN + 10_000 + 3000 + THIRTY_MINUTES + 5000,
      events: [TIME_ORIGIN + 10_000 + 3000 + THIRTY_MINUTES + 5000],
    });
  });

  it('converts end, event and exception offsets taken after a sleep on the SDK clock', () => {
    const span = tracer.startSpan('offsets-after-sleep');
    advanceAwake(3000);
    sleep(THIRTY_MINUTES);
    advanceAwake(2000);
    span.addEvent('time-second', perf.getOffsetFromOrigin());
    span.addEvent('time-third', { key: 'value' }, perf.getOffsetFromOrigin());
    span.recordException(new Error('after wake'), perf.getOffsetFromOrigin());
    advanceAwake(3000);
    span.end(perf.getOffsetFromOrigin());

    const afterWake = TIME_ORIGIN + 10_000 + 3000 + THIRTY_MINUTES;
    const [finished] = exporter.getFinishedSpans();
    expect(toMillis(finished)).to.deep.equal({
      start: TIME_ORIGIN + 10_000,
      end: afterWake + 5000,
      events: [afterWake + 2000, afterWake + 2000, afterWake + 2000],
    });
  });

  it('converts start and end offsets recorded before a sleep on the SDK clock', () => {
    const entryStartTime = perf.getOffsetFromOrigin();
    advanceAwake(1000);
    perf.checkDrift(); // e.g. the blur as the machine goes to sleep
    sleep(THIRTY_MINUTES);
    advanceAwake(4000);

    tracer
      .startSpan('entry-before-sleep', { startTime: entryStartTime })
      .end(entryStartTime + 1000);

    const [finished] = exporter.getFinishedSpans();
    expect(toMillis(finished)).to.deep.equal({
      start: TIME_ORIGIN + 10_000,
      end: TIME_ORIGIN + 11_000,
      events: [],
    });
  });

  it('anchors offsets to the wall clock at creation when no sleep falls in between', () => {
    // Under the drift threshold, so the SDK clock keeps its origin and trails
    // Date.now() by 300ms
    sleep(300);
    const span = tracer.startSpan('short-request');
    advanceAwake(20);
    span.addEvent('responseEnd', perf.getOffsetFromOrigin());
    advanceAwake(5);
    span.end();

    // In line with the span's Date.now() start and end, not 300ms before them
    const [finished] = exporter.getFinishedSpans();
    expect(toMillis(finished)).to.deep.equal({
      start: TIME_ORIGIN + 10_300,
      end: TIME_ORIGIN + 10_325,
      events: [TIME_ORIGIN + 10_320],
    });
  });

  it('keeps epoch, Date and HrTime times', () => {
    sleep(THIRTY_MINUTES);
    const span = tracer.startSpan('given-times', {
      startTime: 2_000_000_000_000,
    });
    span.addEvent('epoch', 2_000_000_000_001);
    span.addEvent('date', new Date(2_000_000_000_002));
    span.end([2_000_000_000, 3_000_000]);

    const [finished] = exporter.getFinishedSpans();
    expect(toMillis(finished)).to.deep.equal({
      start: 2_000_000_000_000,
      end: 2_000_000_000_003,
      events: [2_000_000_000_001, 2_000_000_000_002],
    });
  });

  it('makes the span from startActiveSpan the active span', () => {
    const result = tracer.startActiveSpan('parent', (span) => {
      expect(trace.getActiveSpan()).to.equal(span);
      tracer.startSpan('child').end();
      sleep(THIRTY_MINUTES);
      span.end();
      return 'done';
    });

    expect(result).to.equal('done');
    const [child, parent] = exporter.getFinishedSpans();
    expect(child.parentSpanContext?.spanId).to.equal(
      parent.spanContext().spanId,
    );
    expect(toMillis(parent).end).to.equal(
      TIME_ORIGIN + 10_000 + THIRTY_MINUTES,
    );
  });

  it('passes the startActiveSpan options and context through', () => {
    const outer = tracer.startSpan('outer');
    const outerContext = trace.setSpan(context.active(), outer);

    tracer.startActiveSpan(
      'inner',
      { attributes: { key: 'value' } },
      outerContext,
      (span) => {
        span.end();
      },
    );
    outer.end();

    const [inner] = exporter.getFinishedSpans();
    expect(inner.attributes).to.deep.equal({
      key: 'value',
      'emb.perf_clock_lag_delta_ms': 0,
    });
    expect(inner.parentSpanContext?.spanId).to.equal(
      outer.spanContext().spanId,
    );
  });

  it('starts EmbraceExtendedSpans, which EmbraceTraceManager hands out as they are', () => {
    const manager = new EmbraceTraceManager({ tracerProvider: provider });
    const span = manager.startSpan('extended', {
      attributes: { kept: 'yes', removed: 'yes' },
    });

    expect(span).to.be.instanceOf(EmbraceExtendedSpan);
    expect(manager.getSpan(trace.setSpan(context.active(), span))).to.equal(
      span,
    );

    span.removeAttribute('removed');
    sleep(THIRTY_MINUTES);
    span.fail();

    const [finished] = exporter.getFinishedSpans();
    expect(finished.attributes).to.deep.equal({
      kept: 'yes',
      'emb.type': 'perf',
      'emb.error_code': 'FAILURE',
      'emb.perf_clock_lag_delta_ms': THIRTY_MINUTES,
    });
    expect(toMillis(finished).end).to.equal(
      TIME_ORIGIN + 10_000 + THIRTY_MINUTES,
    );
  });

  it('records only the time slept while the span was open in emb.perf_clock_lag_delta_ms', () => {
    sleep(THIRTY_MINUTES); // before the span starts, so not part of it
    const span = tracer.startSpan('across-sleep');
    advanceAwake(3000);
    sleep(TEN_MINUTES);
    advanceAwake(2000);
    span.end();

    const [finished] = exporter.getFinishedSpans();
    expect(finished.attributes['emb.perf_clock_lag_delta_ms']).to.equal(
      TEN_MINUTES,
    );
  });

  it('keeps emb.perf_clock_lag_delta_ms from the first end', () => {
    const span = tracer.startSpan('ended-twice');
    span.end();
    sleep(THIRTY_MINUTES);
    span.end();

    const [finished] = exporter.getFinishedSpans();
    expect(finished.attributes['emb.perf_clock_lag_delta_ms']).to.equal(0);
  });

  it('ends a span that is not sampled', () => {
    const unsampledTracer = new EmbraceTracerProvider({
      perf,
      sampler: new AlwaysOffSampler(),
    }).getTracer('test');
    const span = unsampledTracer.startSpan('not-sampled');

    expect(() => {
      span.end();
    }).not.to.throw();
  });
});
