import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { setupTestTraceExporter } from '../../../tests/utils/index.ts';
import { KEY_EMB_PERF_CLOCK_LAG_MS } from '../../constants/index.ts';
import { OTelPerformanceManager } from '../../utils/index.ts';
import { PerfClockLagSpanProcessor } from './PerfClockLagSpanProcessor.ts';

const { expect } = chai;

const TIME_ORIGIN = 1756138004000;
const ONE_HOUR = 60 * 60 * 1000;

describe('PerfClockLagSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let tracer: Tracer;
  let clock: sinon.SinonFakeTimers;
  let perfNow: number;

  // Both clocks move forward together while the device is awake.
  const advanceAwake = (ms: number) => {
    perfNow += ms;
    clock.tick(ms);
  };

  // While the device sleeps Date.now() keeps moving but performance.now() does not.
  const advanceAsleep = (ms: number) => {
    clock.setSystemTime(Date.now() + ms);
  };

  before(() => {
    const perf = new OTelPerformanceManager({
      now: () => perfNow,
      timeOrigin: TIME_ORIGIN,
    });
    memoryExporter = setupTestTraceExporter([
      new PerfClockLagSpanProcessor({ perf }),
    ]);
    tracer = trace.getTracer('test-tracer');
  });

  beforeEach(() => {
    clock = sinon.useFakeTimers(TIME_ORIGIN);
    perfNow = 0;
  });

  afterEach(() => {
    memoryExporter.reset();
    clock.restore();
  });

  it('should record no lag when both clocks agree', () => {
    const span = tracer.startSpan('test-span');
    advanceAwake(500);
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes[KEY_EMB_PERF_CLOCK_LAG_MS]).to.equal(0);
  });

  it('should record the time slept before the span started', () => {
    advanceAsleep(ONE_HOUR);

    const span = tracer.startSpan('test-span');
    advanceAwake(500);
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes[KEY_EMB_PERF_CLOCK_LAG_MS]).to.equal(
      ONE_HOUR,
    );
  });

  it('should record the time slept while the span was open', () => {
    const span = tracer.startSpan('test-span');
    advanceAwake(500);
    advanceAsleep(ONE_HOUR);
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes[KEY_EMB_PERF_CLOCK_LAG_MS]).to.equal(
      ONE_HOUR,
    );
  });

  it('should record a negative lag when the system clock moves backwards', () => {
    clock.setSystemTime(Date.now() - 5000);

    const span = tracer.startSpan('test-span');
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes[KEY_EMB_PERF_CLOCK_LAG_MS]).to.equal(
      -5000,
    );
  });

  it('should round the lag to whole milliseconds', () => {
    perfNow = 0.4;
    advanceAsleep(1000);

    const span = tracer.startSpan('test-span');
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes[KEY_EMB_PERF_CLOCK_LAG_MS]).to.equal(
      1000,
    );
  });

  it('should make sure forceFlush no-op does not fail', async () => {
    const processor = new PerfClockLagSpanProcessor({
      perf: new OTelPerformanceManager(),
    });

    await processor.forceFlush();
  });

  it('should make sure shutdown no-op does not fail', async () => {
    const processor = new PerfClockLagSpanProcessor({
      perf: new OTelPerformanceManager(),
    });

    await processor.shutdown();
  });
});
