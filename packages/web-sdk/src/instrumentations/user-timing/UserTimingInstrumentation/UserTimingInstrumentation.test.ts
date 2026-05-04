import { SeverityNumber } from '@opentelemetry/api-logs';
import { timeInputToHrTime } from '@opentelemetry/core';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  InMemoryDiagLogger,
  MockPerformanceManager,
  setupTestLogExporter,
  setupTestTraceExporter,
} from '../../../../tests/utils/index.ts';
import { log } from '../../../api-logs/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceLogManager,
  EmbraceUserSessionManager,
} from '../../../managers/index.ts';
import { UserTimingInstrumentation } from './UserTimingInstrumentation.ts';

const { expect } = chai;

type ObserverCallback = (list: {
  getEntries: () => PerformanceEntry[];
}) => void;

let markObserverCallback: ObserverCallback | null = null;
let measureObserverCallback: ObserverCallback | null = null;
let markObserverDisconnected = false;
let measureObserverDisconnected = false;
let markObserveOptions: { type: string; buffered: boolean } | null = null;
let measureObserveOptions: { type: string; buffered: boolean } | null = null;

class MockPerformanceObserver {
  public static supportedEntryTypes = ['mark', 'measure'];
  private _callback: ObserverCallback;
  private _type: string | null = null;

  public constructor(callback: ObserverCallback) {
    this._callback = callback;
  }

  public observe(options: { type: string; buffered: boolean }): void {
    this._type = options.type;
    if (options.type === 'mark') {
      markObserverCallback = this._callback;
      markObserveOptions = options;
      markObserverDisconnected = false;
    } else if (options.type === 'measure') {
      measureObserverCallback = this._callback;
      measureObserveOptions = options;
      measureObserverDisconnected = false;
    }
  }

  public disconnect(): void {
    if (this._type === 'mark') {
      markObserverDisconnected = true;
    } else if (this._type === 'measure') {
      measureObserverDisconnected = true;
    }
  }
}

const triggerMarkEntries = (entries: PerformanceMark[]) => {
  markObserverCallback?.({ getEntries: () => entries });
};

const triggerMeasureEntries = (entries: PerformanceMeasure[]) => {
  measureObserverCallback?.({ getEntries: () => entries });
};

const makeMark = (
  overrides: Partial<PerformanceMark> = {},
): PerformanceMark => ({
  name: 'test-mark',
  entryType: 'mark',
  startTime: 100,
  duration: 0,
  detail: null,
  toJSON: () => ({}),
  ...overrides,
});

const makeMeasure = (
  overrides: Partial<PerformanceMeasure> = {},
): PerformanceMeasure => ({
  name: 'test-measure',
  entryType: 'measure',
  startTime: 50,
  duration: 200,
  detail: null,
  toJSON: () => ({}),
  ...overrides,
});

describe('UserTimingInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let spanExporter: InMemorySpanExporter;
  let clock: sinon.SinonFakeTimers;
  let perf: MockPerformanceManager;
  let limitManager: EmbraceLimitManager;
  let originalPerformanceObserver: typeof globalThis.PerformanceObserver;

  before(() => {
    spanExporter = setupTestTraceExporter();
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    spanExporter.reset();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);

    limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);
    const userSessionManager = new EmbraceUserSessionManager({ limitManager });
    userSessionManager.startSessionPart();
    const logManager = new EmbraceLogManager({
      userSessionManager,
      limitManager,
    });
    log.setGlobalLogManager(logManager);

    originalPerformanceObserver = globalThis.PerformanceObserver;
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      MockPerformanceObserver;

    markObserverCallback = null;
    measureObserverCallback = null;
    markObserverDisconnected = false;
    measureObserverDisconnected = false;
    markObserveOptions = null;
    measureObserveOptions = null;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      originalPerformanceObserver;
    MockPerformanceObserver.supportedEntryTypes = ['mark', 'measure'];
    clock.restore();
  });

  it('should create two buffered observers for mark and measure', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });

    expect(markObserveOptions).to.deep.equal({ type: 'mark', buffered: true });
    expect(measureObserveOptions).to.deep.equal({
      type: 'measure',
      buffered: true,
    });

    instrumentation.disable();
  });

  it('should skip mark observer when mark is unsupported', () => {
    const diagLogger = new InMemoryDiagLogger();
    MockPerformanceObserver.supportedEntryTypes = ['measure'];

    const instrumentation = new UserTimingInstrumentation({
      perf,
      diag: diagLogger,
    });

    expect(markObserveOptions).to.be.null;
    expect(measureObserveOptions).to.not.be.null;
    expect(diagLogger.getDebugLogs().some((m) => m.includes('mark'))).to.be
      .true;

    instrumentation.disable();
  });

  it('should skip measure observer when measure is unsupported', () => {
    const diagLogger = new InMemoryDiagLogger();
    MockPerformanceObserver.supportedEntryTypes = ['mark'];

    const instrumentation = new UserTimingInstrumentation({
      perf,
      diag: diagLogger,
    });

    expect(markObserveOptions).to.not.be.null;
    expect(measureObserveOptions).to.be.null;
    expect(diagLogger.getDebugLogs().some((m) => m.includes('measure'))).to.be
      .true;

    instrumentation.disable();
  });

  it('should skip both observers when neither type is supported', () => {
    const diagLogger = new InMemoryDiagLogger();
    MockPerformanceObserver.supportedEntryTypes = [];

    const instrumentation = new UserTimingInstrumentation({
      perf,
      diag: diagLogger,
    });

    expect(markObserveOptions).to.be.null;
    expect(measureObserveOptions).to.be.null;
    expect(diagLogger.getDebugLogs()).to.have.length(2);

    instrumentation.disable();
  });

  it('should emit a log for a mark entry', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });

    triggerMarkEntries([
      makeMark({ name: 'my-mark', startTime: 150, duration: 0 }),
    ]);

    const logs = memoryExporter.getFinishedLogRecords();
    expect(logs).to.have.length(1);
    const record = logs[0];
    expect(record.eventName).to.equal('emb-user-timing');
    expect(record.severityNumber).to.equal(SeverityNumber.INFO);
    expect(record.attributes['emb.type']).to.equal('ux.user_timing');
    expect(record.attributes['emb.user_timing.name']).to.equal('my-mark');
    expect(record.attributes['emb.user_timing.start_time']).to.equal(150);
    expect(record.attributes['emb.user_timing.duration']).to.equal(0);
    expect(record.attributes['emb.user_timing.entry_type']).to.equal('mark');

    instrumentation.disable();
  });

  it('should set log timestamp to epochMillis of entry startTime', () => {
    clock.tick(1000);
    const timeOriginPerf = new MockPerformanceManager(clock);
    const instrumentation = new UserTimingInstrumentation({
      perf: timeOriginPerf,
    });

    triggerMarkEntries([
      makeMark({ name: 'timed-mark', startTime: 150, duration: 0 }),
    ]);

    const record = memoryExporter.getFinishedLogRecords()[0];
    expect(record.hrTime).to.deep.equal(timeInputToHrTime(1000 + 150));

    instrumentation.disable();
  });

  it('should create a span for a measure entry', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });

    triggerMeasureEntries([
      makeMeasure({ name: 'my-measure', startTime: 50, duration: 300 }),
    ]);

    expect(memoryExporter.getFinishedLogRecords()).to.have.length(0);
    const spans = spanExporter.getFinishedSpans();
    expect(spans).to.have.length(1);
    const span = spans[0];
    expect(span.name).to.equal('my-measure');
    expect(span.attributes['emb.type']).to.equal('ux.user_timing');
    expect(span.attributes['emb.instrumentation']).to.equal('user_timing');
    expect(span.attributes['emb.user_timing.entry_type']).to.equal('measure');
    expect(span.attributes['emb.user_timing.start_time']).to.equal(50);
    expect(span.attributes['emb.user_timing.duration']).to.equal(300);
    // duration attribute must equal the span's own end-start delta
    const spanDurationMs =
      (span.endTime[0] - span.startTime[0]) * 1000 +
      (span.endTime[1] - span.startTime[1]) / 1e6;
    expect(span.attributes['emb.user_timing.duration']).to.equal(
      spanDurationMs,
    );
    expect(span.attributes['emb.user_timing.detail']).to.be.undefined;

    instrumentation.disable();
  });

  it('should set detail as a span attribute for measure entries with detail', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });

    triggerMeasureEntries([
      makeMeasure({
        name: 'my-measure',
        detail: { component: 'nav', phase: 'render' },
      }),
    ]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.attributes['emb.user_timing.detail']).to.equal(
      JSON.stringify({ component: 'nav', phase: 'render' }),
    );

    instrumentation.disable();
  });

  it('should deduplicate entries with the same name on the same URL', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });

    triggerMarkEntries([
      makeMark({ name: 'auth-start' }),
      makeMark({ name: 'auth-start' }),
    ]);

    const logs = memoryExporter.getFinishedLogRecords();
    expect(logs).to.have.length(1);

    instrumentation.disable();
  });

  it('should allow the same name after URL changes', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });
    const originalHref = location.href;

    triggerMarkEntries([makeMark({ name: 'page-load' })]);

    history.pushState({}, '', '/other-page');
    triggerMarkEntries([makeMark({ name: 'page-load' })]);
    history.pushState({}, '', originalHref);

    const logs = memoryExporter.getFinishedLogRecords();
    expect(logs).to.have.length(2);

    instrumentation.disable();
  });

  it('should apply the mark volume cap from limitManager and drop entries silently', () => {
    const markCap = 3;
    const capLimitManager = new EmbraceLimitManager({
      ...DEFAULT_LIMITS,
      maxAllowed: { ...DEFAULT_LIMITS.maxAllowed, user_timing_mark: markCap },
    });
    const instrumentation = new UserTimingInstrumentation({
      perf,
      limitManager: capLimitManager,
    });

    triggerMarkEntries(
      Array.from({ length: markCap + 2 }, (_, i) =>
        makeMark({ name: `mark-${i}` }),
      ),
    );

    expect(memoryExporter.getFinishedLogRecords()).to.have.length(markCap);

    instrumentation.disable();
  });

  it('should apply the measure volume cap from limitManager and drop entries silently', () => {
    const measureCap = 2;
    const capLimitManager = new EmbraceLimitManager({
      ...DEFAULT_LIMITS,
      maxAllowed: {
        ...DEFAULT_LIMITS.maxAllowed,
        user_timing_measure: measureCap,
      },
    });
    const instrumentation = new UserTimingInstrumentation({
      perf,
      limitManager: capLimitManager,
    });

    triggerMeasureEntries(
      Array.from({ length: measureCap + 2 }, (_, i) =>
        makeMeasure({ name: `measure-${i}` }),
      ),
    );

    expect(spanExporter.getFinishedSpans()).to.have.length(measureCap);

    instrumentation.disable();
  });

  it('should reset caps after limitManager.reset()', () => {
    const markCap = 3;
    const capLimitManager = new EmbraceLimitManager({
      ...DEFAULT_LIMITS,
      maxAllowed: { ...DEFAULT_LIMITS.maxAllowed, user_timing_mark: markCap },
    });
    const instrumentation = new UserTimingInstrumentation({
      perf,
      limitManager: capLimitManager,
    });

    triggerMarkEntries(
      Array.from({ length: markCap }, (_, i) =>
        makeMark({ name: `mark-${i}` }),
      ),
    );
    expect(memoryExporter.getFinishedLogRecords()).to.have.length(markCap);

    capLimitManager.reset();
    memoryExporter.reset();

    triggerMarkEntries([makeMark({ name: 'mark-after-reset' })]);
    expect(memoryExporter.getFinishedLogRecords()).to.have.length(1);

    instrumentation.disable();
  });

  it('should not enforce cap when no limitManager is provided', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });

    // Without a limitManager, all entries should be emitted
    triggerMarkEntries(
      Array.from({ length: 5 }, (_, i) => makeMark({ name: `mark-${i}` })),
    );

    expect(memoryExporter.getFinishedLogRecords()).to.have.length(5);

    instrumentation.disable();
  });

  it('should not emit after disable', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });
    instrumentation.disable();

    triggerMarkEntries([makeMark({ name: 'late-mark' })]);
    triggerMeasureEntries([makeMeasure({ name: 'late-measure' })]);

    expect(memoryExporter.getFinishedLogRecords()).to.have.length(0);
  });

  it('should serialize detail as JSON string in log body', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });

    triggerMarkEntries([
      makeMark({ name: 'auth', detail: { phase: 'login', attempt: 2 } }),
    ]);

    const logs = memoryExporter.getFinishedLogRecords();
    expect(logs).to.have.length(1);
    expect(logs[0].body).to.equal(
      JSON.stringify({ phase: 'login', attempt: 2 }),
    );

    instrumentation.disable();
  });

  it('should not set body when detail is null', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });

    triggerMarkEntries([makeMark({ name: 'no-detail', detail: null })]);

    const logs = memoryExporter.getFinishedLogRecords();
    expect(logs).to.have.length(1);
    expect(logs[0].body).to.be.undefined;

    instrumentation.disable();
  });

  it('should not set body when detail is undefined', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });

    const entry = makeMark({ name: 'no-detail-undef' });
    (entry as unknown as Record<string, unknown>)['detail'] = undefined;
    triggerMarkEntries([entry]);

    const logs = memoryExporter.getFinishedLogRecords();
    expect(logs).to.have.length(1);
    expect(logs[0].body).to.be.undefined;

    instrumentation.disable();
  });

  it('should disconnect both observers on disable', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });

    expect(markObserverDisconnected).to.be.false;
    expect(measureObserverDisconnected).to.be.false;

    instrumentation.disable();

    expect(markObserverDisconnected).to.be.true;
    expect(measureObserverDisconnected).to.be.true;
  });

  it('should reset deduplication state after disable and re-enable', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });

    triggerMarkEntries([makeMark({ name: 'once' })]);
    expect(memoryExporter.getFinishedLogRecords()).to.have.length(1);

    instrumentation.disable();
    memoryExporter.reset();
    instrumentation.enable();

    triggerMarkEntries([makeMark({ name: 'once' })]);
    expect(memoryExporter.getFinishedLogRecords()).to.have.length(1);

    instrumentation.disable();
  });

  it('should not double-enable when enable is called twice', () => {
    const instrumentation = new UserTimingInstrumentation({ perf });
    instrumentation.enable();

    triggerMarkEntries([makeMark({ name: 'x' })]);
    expect(memoryExporter.getFinishedLogRecords()).to.have.length(1);

    instrumentation.disable();
  });

  describe('allowedEntries filter', () => {
    it('should capture all entries when no filter is provided', () => {
      const instrumentation = new UserTimingInstrumentation({ perf });

      triggerMarkEntries([
        makeMark({ name: 'app-start' }),
        makeMark({ name: 'vendor-init' }),
      ]);

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(2);
      instrumentation.disable();
    });

    it('should only capture entries whose name is in the string array', () => {
      const instrumentation = new UserTimingInstrumentation({
        perf,
        allowedEntries: ['app-start', 'app-ready'],
      });

      triggerMarkEntries([
        makeMark({ name: 'app-start' }),
        makeMark({ name: 'vendor-init' }),
        makeMark({ name: 'app-ready' }),
      ]);

      const logs = memoryExporter.getFinishedLogRecords();
      expect(logs).to.have.length(2);
      expect(
        logs.map((l) => l.attributes['emb.user_timing.name']),
      ).to.deep.equal(['app-start', 'app-ready']);

      instrumentation.disable();
    });

    it('should ignore all entries when the string array is empty', () => {
      const instrumentation = new UserTimingInstrumentation({
        perf,
        allowedEntries: [],
      });

      triggerMarkEntries([makeMark({ name: 'app-start' })]);
      triggerMeasureEntries([makeMeasure({ name: 'render' })]);

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(0);
      instrumentation.disable();
    });

    it('should capture entries for which the callback returns true', () => {
      const instrumentation = new UserTimingInstrumentation({
        perf,
        allowedEntries: (entry) => entry.name.startsWith('app-'),
      });

      triggerMarkEntries([
        makeMark({ name: 'app-start' }),
        makeMark({ name: 'vendor-boot' }),
        makeMark({ name: 'app-ready' }),
      ]);

      const logs = memoryExporter.getFinishedLogRecords();
      expect(logs).to.have.length(2);
      expect(
        logs.map((l) => l.attributes['emb.user_timing.name']),
      ).to.deep.equal(['app-start', 'app-ready']);

      instrumentation.disable();
    });

    it('should pass the full entry to the callback', () => {
      const received: Array<PerformanceMark | PerformanceMeasure> = [];
      const instrumentation = new UserTimingInstrumentation({
        perf,
        allowedEntries: (entry) => {
          received.push(entry);
          return true;
        },
      });

      const mark = makeMark({ name: 'app-start', startTime: 42 });
      triggerMarkEntries([mark]);

      expect(received).to.have.length(1);
      expect(received[0].name).to.equal('app-start');
      expect(received[0].startTime).to.equal(42);

      instrumentation.disable();
    });

    it('should apply the filter before deduplication', () => {
      const instrumentation = new UserTimingInstrumentation({
        perf,
        allowedEntries: ['app-start'],
      });

      // 'vendor' is filtered out; should not consume a dedup slot
      triggerMarkEntries([
        makeMark({ name: 'vendor-init' }),
        makeMark({ name: 'app-start' }),
        makeMark({ name: 'app-start' }), // duplicate; deduped
      ]);

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(1);
      instrumentation.disable();
    });

    it('should apply the filter to measures', () => {
      const instrumentation = new UserTimingInstrumentation({
        perf,
        allowedEntries: (entry) => entry.entryType === 'mark',
      });

      triggerMarkEntries([makeMark({ name: 'app-start' })]);
      triggerMeasureEntries([makeMeasure({ name: 'render' })]);

      const logs = memoryExporter.getFinishedLogRecords();
      expect(logs).to.have.length(1);
      expect(logs[0].attributes['emb.user_timing.entry_type']).to.equal('mark');

      instrumentation.disable();
    });
  });
});
