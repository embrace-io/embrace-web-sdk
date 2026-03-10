import { SeverityNumber } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
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
  EmbraceSpanSessionManager,
} from '../../../managers/index.ts';
import { LoafInstrumentation } from './LoafInstrumentation.ts';
import type { PerformanceLongAnimationFrameTimingEntry } from './types.ts';

const { expect } = chai;

const makeEntry = (
  overrides: Partial<PerformanceLongAnimationFrameTimingEntry> = {},
): PerformanceLongAnimationFrameTimingEntry => ({
  name: 'long-animation-frame',
  entryType: 'long-animation-frame',
  startTime: 100,
  duration: 80,
  renderStart: 160,
  styleAndLayoutStart: 0,
  blockingDuration: 30,
  firstUIEventTimestamp: 0,
  scripts: [],
  toJSON: () => ({}),
  ...overrides,
});

type ObserverCallback = (list: {
  getEntries: () => PerformanceLongAnimationFrameTimingEntry[];
}) => void;

let observerCallback: ObserverCallback | null = null;
let observerDisconnected = false;
let observeOptions: { type: string; buffered: boolean } | null = null;

class MockPerformanceObserver {
  public static supportedEntryTypes = ['long-animation-frame'];
  public constructor(callback: ObserverCallback) {
    observerCallback = callback;
    observerDisconnected = false;
  }
  public observe(options: { type: string; buffered: boolean }): void {
    observeOptions = options;
  }
  public disconnect(): void {
    observerDisconnected = true;
  }
}

const triggerEntries = (
  entries: PerformanceLongAnimationFrameTimingEntry[],
) => {
  observerCallback?.({ getEntries: () => entries });
};

describe('LoafInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let clock: sinon.SinonFakeTimers;
  let perf: MockPerformanceManager;
  let spanSessionManager: EmbraceSpanSessionManager;
  let originalPerformanceObserver: typeof globalThis.PerformanceObserver;

  before(() => {
    setupTestTraceExporter();
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);
    const limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);
    spanSessionManager = new EmbraceSpanSessionManager({ limitManager });
    spanSessionManager.startSessionSpan();
    const logManager = new EmbraceLogManager({
      spanSessionManager,
      limitManager,
    });
    log.setGlobalLogManager(logManager);

    originalPerformanceObserver = globalThis.PerformanceObserver;
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      MockPerformanceObserver;

    observerCallback = null;
    observerDisconnected = false;
    observeOptions = null;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      originalPerformanceObserver;
    clock.restore();
  });

  it('should observe long-animation-frame entries', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    expect(observeOptions).to.deep.equal({
      type: 'long-animation-frame',
      buffered: true,
    });

    instrumentation.disable();
  });

  it('should emit a report on session end with correct aggregate metrics', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([
      makeEntry({
        duration: 100,
        renderStart: 160,
        blockingDuration: 50,
        startTime: 100,
      }),
      makeEntry({
        duration: 80,
        renderStart: 140,
        blockingDuration: 30,
        startTime: 200,
      }),
    ]);

    spanSessionManager.endSessionSpan();

    const logs = memoryExporter.getFinishedLogRecords();
    const report = logs.find((l) => l.eventName === 'emb-loaf-report');
    expect(report).to.exist;
    expect(report?.eventName).to.equal('emb-loaf-report');
    expect(report?.severityNumber).to.equal(SeverityNumber.INFO);
    expect(report?.attributes['emb.type']).to.equal('perf.loaf');
    expect(report?.attributes['emb.loaf.total_duration']).to.equal(180);
    expect(report?.attributes['emb.loaf.count']).to.equal(2);
    expect(report?.attributes['emb.loaf.longest_duration']).to.equal(100);
    expect(
      report?.attributes['emb.loaf.longest_duration_excluding_first'],
    ).to.equal(80);

    instrumentation.disable();
  });

  it('should calculate work duration correctly', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    // renderStart present: work = renderStart - startTime = 150 - 100 = 50
    // renderStart = 0 (falsy): work = duration = 80
    triggerEntries([
      makeEntry({ startTime: 100, duration: 100, renderStart: 150 }),
      makeEntry({ startTime: 200, duration: 80, renderStart: 0 }),
    ]);

    spanSessionManager.endSessionSpan();

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.loaf.work_duration']).to.equal(130);

    instrumentation.disable();
  });

  it('should calculate style and layout duration correctly', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    // styleAndLayoutStart present: startTime + duration - styleAndLayoutStart = 100 + 100 - 180 = 20
    // styleAndLayoutStart = 0: contributes 0
    triggerEntries([
      makeEntry({ startTime: 100, duration: 100, styleAndLayoutStart: 180 }),
      makeEntry({ startTime: 200, duration: 80, styleAndLayoutStart: 0 }),
    ]);

    spanSessionManager.endSessionSpan();

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.loaf.style_and_layout_duration']).to.equal(
      20,
    );

    instrumentation.disable();
  });

  it('should skip first entry for total blocking duration calculation', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([
      makeEntry({ blockingDuration: 100, firstUIEventTimestamp: 0 }),
      makeEntry({ blockingDuration: 50, firstUIEventTimestamp: 0 }),
      makeEntry({ blockingDuration: 30, firstUIEventTimestamp: 0 }),
    ]);

    spanSessionManager.endSessionSpan();

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    // First entry (100) skipped, sum of 50 + 30 = 80
    expect(report?.attributes['emb.loaf.total_blocking_duration']).to.equal(80);

    instrumentation.disable();
  });

  it('should filter interaction-driven entries from total blocking duration', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([
      makeEntry({ blockingDuration: 100, firstUIEventTimestamp: 0 }),
      makeEntry({ blockingDuration: 50, firstUIEventTimestamp: 0 }),
      makeEntry({ blockingDuration: 30, firstUIEventTimestamp: 12345 }), // interaction-driven
    ]);

    spanSessionManager.endSessionSpan();

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    // First skipped, third filtered (interaction), only second counted = 50
    expect(report?.attributes['emb.loaf.total_blocking_duration']).to.equal(50);

    instrumentation.disable();
  });

  it('should not emit report when there are no entries', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    spanSessionManager.endSessionSpan();

    const logs = memoryExporter.getFinishedLogRecords();
    const reports = logs.filter((l) => l.eventName === 'emb-loaf-report');
    expect(reports).to.have.lengthOf(0);

    instrumentation.disable();
  });

  it('should no-op when PerformanceObserver does not support long-animation-frame', () => {
    (globalThis as Record<string, unknown>)['PerformanceObserver'] = class {
      public static supportedEntryTypes = ['resource', 'navigation'];
      public observe(): void {}
      public disconnect(): void {}
    };

    const diagLogger = new InMemoryDiagLogger();
    const instrumentation = new LoafInstrumentation({
      perf,
      diag: diagLogger,
    });
    instrumentation.setSessionManager(spanSessionManager);

    expect(diagLogger.getDebugLogs().length).to.be.greaterThan(0);
    expect(observerCallback).to.be.null;

    instrumentation.disable();
  });

  it('should not process entries when disabled', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    instrumentation.disable();

    triggerEntries([makeEntry()]);

    // Re-create a session to trigger end
    spanSessionManager.startSessionSpan();
    spanSessionManager.endSessionSpan();

    const reports = memoryExporter
      .getFinishedLogRecords()
      .filter((l) => l.eventName === 'emb-loaf-report');
    expect(reports).to.have.lengthOf(0);
  });

  it('should disconnect observer on disable', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    instrumentation.disable();
    expect(observerDisconnected).to.be.true;
  });

  it('should handle longestDurationExcludingFirst when only one entry', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([makeEntry({ duration: 100 })]);
    spanSessionManager.endSessionSpan();

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.loaf.longest_duration']).to.equal(100);
    expect(
      report?.attributes['emb.loaf.longest_duration_excluding_first'],
    ).to.equal(0);

    instrumentation.disable();
  });

  it('should rate total blocking duration as good at exact 200ms boundary', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([
      makeEntry({ blockingDuration: 0 }),
      makeEntry({ blockingDuration: 200 }),
    ]);

    spanSessionManager.endSessionSpan();

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.loaf.total_blocking_duration']).to.equal(
      200,
    );
    expect(report?.attributes['emb.loaf.rating']).to.equal('good');

    instrumentation.disable();
  });

  it('should rate total blocking duration as needs-improvement at 201ms', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([
      makeEntry({ blockingDuration: 0 }),
      makeEntry({ blockingDuration: 201 }),
    ]);

    spanSessionManager.endSessionSpan();

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.loaf.total_blocking_duration']).to.equal(
      201,
    );
    expect(report?.attributes['emb.loaf.rating']).to.equal('needs-improvement');

    instrumentation.disable();
  });

  it('should rate total blocking duration as needs-improvement at exact 600ms boundary', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([
      makeEntry({ blockingDuration: 0 }),
      makeEntry({ blockingDuration: 600 }),
    ]);

    spanSessionManager.endSessionSpan();

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.loaf.total_blocking_duration']).to.equal(
      600,
    );
    expect(report?.attributes['emb.loaf.rating']).to.equal('needs-improvement');

    instrumentation.disable();
  });

  it('should rate total blocking duration as poor at 601ms', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([
      makeEntry({ blockingDuration: 0 }),
      makeEntry({ blockingDuration: 601 }),
    ]);

    spanSessionManager.endSessionSpan();

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.loaf.total_blocking_duration']).to.equal(
      601,
    );
    expect(report?.attributes['emb.loaf.rating']).to.equal('poor');

    instrumentation.disable();
  });

  it('should not create duplicate observers when enable() is called twice', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    // enable() was already called in constructor; call again
    instrumentation.enable();

    triggerEntries([makeEntry({ duration: 60 })]);
    spanSessionManager.endSessionSpan();

    const reports = memoryExporter
      .getFinishedLogRecords()
      .filter((l) => l.eventName === 'emb-loaf-report');
    expect(reports).to.have.lengthOf(1);

    instrumentation.disable();
  });

  it('should re-register session end listener when setSessionManager is called', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([makeEntry({ duration: 60 })]);

    // Create a second session manager and switch to it
    const limitManager2 = new EmbraceLimitManager(DEFAULT_LIMITS);
    const spanSessionManager2 = new EmbraceSpanSessionManager({
      limitManager: limitManager2,
    });
    spanSessionManager2.startSessionSpan();
    const logManager2 = new EmbraceLogManager({
      spanSessionManager: spanSessionManager2,
      limitManager: limitManager2,
    });
    log.setGlobalLogManager(logManager2);
    instrumentation.setSessionManager(spanSessionManager2);

    triggerEntries([makeEntry({ duration: 90 })]);
    spanSessionManager2.endSessionSpan();

    const reports = memoryExporter
      .getFinishedLogRecords()
      .filter((l) => l.eventName === 'emb-loaf-report');
    expect(reports).to.have.lengthOf(1);
    expect(reports[0].attributes['emb.loaf.total_duration']).to.equal(150);

    instrumentation.disable();
  });

  it('should not emit a log record when disable() is called', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([makeEntry({ duration: 100 }), makeEntry({ duration: 80 })]);

    instrumentation.disable();

    const reports = memoryExporter
      .getFinishedLogRecords()
      .filter((l) => l.eventName === 'emb-loaf-report');
    expect(reports).to.have.lengthOf(0);
  });

  it('should not bleed accumulated data across sessions', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([
      makeEntry({ duration: 100, blockingDuration: 50 }),
      makeEntry({ duration: 80, blockingDuration: 30 }),
    ]);

    spanSessionManager.endSessionSpan();

    const firstReport = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(firstReport).to.exist;
    expect(firstReport?.attributes['emb.loaf.total_duration']).to.equal(180);
    expect(firstReport?.attributes['emb.loaf.count']).to.equal(2);
    // First entry excluded from blocking duration: only 30
    expect(
      firstReport?.attributes['emb.loaf.total_blocking_duration'],
    ).to.equal(30);

    memoryExporter.reset();

    spanSessionManager.startSessionSpan();

    triggerEntries([
      makeEntry({ duration: 60, blockingDuration: 20 }),
      makeEntry({ duration: 40, blockingDuration: 10 }),
    ]);

    spanSessionManager.endSessionSpan();

    const secondReport = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(secondReport).to.exist;
    expect(secondReport?.attributes['emb.loaf.total_duration']).to.equal(100);
    expect(secondReport?.attributes['emb.loaf.count']).to.equal(2);
    // First entry of second session excluded: only 10
    expect(
      secondReport?.attributes['emb.loaf.total_blocking_duration'],
    ).to.equal(10);
    // First entry excluded from longest_duration_excluding_first
    expect(
      secondReport?.attributes['emb.loaf.longest_duration_excluding_first'],
    ).to.equal(40);

    instrumentation.disable();
  });

  it('should clamp negative style and layout duration to zero', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    // styleAndLayoutStart > startTime + duration would produce negative value
    triggerEntries([
      makeEntry({
        startTime: 100,
        duration: 50,
        styleAndLayoutStart: 200,
      }),
    ]);

    spanSessionManager.endSessionSpan();

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.loaf.style_and_layout_duration']).to.equal(
      0,
    );

    instrumentation.disable();
  });
});
