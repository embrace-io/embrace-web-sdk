import { SeverityNumber } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  InMemoryDiagLogger,
  MockPerformanceManager,
  setupTestLogExporter,
  setupTestStorage,
  setupTestTraceExporter,
} from '../../../../tests/utils/index.ts';
import { log } from '../../../api-logs/index.ts';
import type { SpanSessionManagerInternal } from '../../../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceLogManager,
  EmbraceSpanSessionManager,
} from '../../../managers/index.ts';
import { LoafInstrumentation } from './LoafInstrumentation.ts';

const { expect } = chai;

const makeScript = (
  overrides: Partial<PerformanceScriptTiming> = {},
): PerformanceScriptTiming => ({
  name: 'script',
  entryType: 'script',
  startTime: 0,
  duration: 50,
  invoker: '',
  invokerType: 'classic-script',
  sourceURL: 'https://example.com/app.js',
  sourceFunctionName: '',
  sourceCharPosition: 0,
  executionStart: 0,
  forcedStyleAndLayoutDuration: 0,
  pauseDuration: 0,
  windowAttribution: 'self',
  window: undefined,
  toJSON: () => ({}),
  ...overrides,
});

const makeEntry = (
  overrides: Partial<PerformanceLongAnimationFrameTiming> = {},
): PerformanceLongAnimationFrameTiming => ({
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
  getEntries: () => PerformanceLongAnimationFrameTiming[];
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

const triggerEntries = (entries: PerformanceLongAnimationFrameTiming[]) => {
  observerCallback?.({ getEntries: () => entries });
};

describe('LoafInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let clock: sinon.SinonFakeTimers;
  let perf: MockPerformanceManager;
  let spanSessionManager: SpanSessionManagerInternal;
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
    const storage = setupTestStorage();
    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager,
      perf,
      storage,
      visibilityDoc: window.document,
    });
    spanSessionManager.startSessionPartInternal('init');
    const logManager = new EmbraceLogManager({
      spanSessionManager,
      limitManager,
      perf,
      storage,
      visibilityDoc: window.document,
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

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const logs = memoryExporter.getFinishedLogRecords();
    const report = logs.find((l) => l.eventName === 'emb-loaf-report');
    expect(report).to.exist;
    expect(report?.eventName).to.equal('emb-loaf-report');
    expect(report?.severityNumber).to.equal(SeverityNumber.INFO);
    expect(report?.attributes['emb.type']).to.equal('ux.web_vital');
    expect(report?.attributes['emb.web_vital.id'])
      .to.be.a('string')
      .and.to.have.length.greaterThan(0);
    expect(report?.attributes['emb.web_vital.name']).to.equal('TBD');
    expect(report?.attributes['emb.tbd.loaf_total_duration']).to.equal(180);
    expect(report?.attributes['emb.tbd.loaf_count']).to.equal(2);
    expect(report?.attributes['emb.tbd.loaf_longest_duration']).to.equal(100);
    expect(
      report?.attributes['emb.tbd.loaf_longest_duration_excluding_first'],
    ).to.equal(80);
    expect(Object.keys(report?.attributes ?? {})).to.have.lengthOf(11);

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

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.tbd.loaf_work_duration']).to.equal(130);

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

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(
      report?.attributes['emb.tbd.loaf_style_and_layout_duration'],
    ).to.equal(20);

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

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    // First entry (100) skipped, sum of 50 + 30 = 80
    expect(report?.attributes['emb.web_vital.value']).to.equal(80);

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

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    // First skipped, third filtered (interaction), only second counted = 50
    expect(report?.attributes['emb.web_vital.value']).to.equal(50);

    instrumentation.disable();
  });

  it('should not emit report when there are no entries', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    spanSessionManager.endSessionPartInternal('web_inactivity');

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
    spanSessionManager.startSessionPartInternal('init');
    spanSessionManager.endSessionPartInternal('web_inactivity');

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
    spanSessionManager.endSessionPartInternal('web_inactivity');

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.tbd.loaf_longest_duration']).to.equal(100);
    expect(
      report?.attributes['emb.tbd.loaf_longest_duration_excluding_first'],
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

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.web_vital.value']).to.equal(200);
    expect(report?.attributes['emb.web_vital.rating']).to.equal('good');

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

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.web_vital.value']).to.equal(201);
    expect(report?.attributes['emb.web_vital.rating']).to.equal(
      'needs-improvement',
    );

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

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.web_vital.value']).to.equal(600);
    expect(report?.attributes['emb.web_vital.rating']).to.equal(
      'needs-improvement',
    );

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

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(report?.attributes['emb.web_vital.value']).to.equal(601);
    expect(report?.attributes['emb.web_vital.rating']).to.equal('poor');

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
    spanSessionManager.endSessionPartInternal('web_inactivity');

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
    const storage2 = setupTestStorage();
    const spanSessionManager2 = new EmbraceSpanSessionManager({
      limitManager: limitManager2,
      perf,
      storage: storage2,
      visibilityDoc: window.document,
    });
    spanSessionManager2.startSessionPartInternal('init');
    const logManager2 = new EmbraceLogManager({
      spanSessionManager: spanSessionManager2,
      limitManager: limitManager2,
      perf,
      storage: storage2,
      visibilityDoc: window.document,
    });
    log.setGlobalLogManager(logManager2);
    instrumentation.setSessionManager(spanSessionManager2);

    triggerEntries([makeEntry({ duration: 90 })]);
    spanSessionManager2.endSessionPartInternal('web_inactivity');

    const reports = memoryExporter
      .getFinishedLogRecords()
      .filter((l) => l.eventName === 'emb-loaf-report');
    expect(reports).to.have.lengthOf(1);
    expect(reports[0].attributes['emb.tbd.loaf_total_duration']).to.equal(150);

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

  it('should generate a unique web vital id per session', () => {
    const instrumentation = new LoafInstrumentation({ perf });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([makeEntry({ duration: 100 })]);
    spanSessionManager.endSessionPartInternal('web_inactivity');

    const firstReport = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    const firstId = firstReport?.attributes['emb.web_vital.id'];
    expect(firstId).to.be.a('string').and.to.have.length.greaterThan(0);

    memoryExporter.reset();
    spanSessionManager.startSessionPartInternal('init');

    triggerEntries([makeEntry({ duration: 80 })]);
    spanSessionManager.endSessionPartInternal('web_inactivity');

    const secondReport = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    const secondId = secondReport?.attributes['emb.web_vital.id'];
    expect(secondId).to.be.a('string').and.to.have.length.greaterThan(0);
    expect(secondId).to.not.equal(firstId);

    instrumentation.disable();
  });

  it('should not bleed accumulated data across sessions', () => {
    const instrumentation = new LoafInstrumentation({
      perf,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([makeEntry({ duration: 100 }), makeEntry({ duration: 80 })]);

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const firstReport = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(firstReport).to.exist;
    expect(firstReport?.attributes['emb.tbd.loaf_total_duration']).to.equal(
      180,
    );
    expect(firstReport?.attributes['emb.tbd.loaf_count']).to.equal(2);

    memoryExporter.reset();

    spanSessionManager.startSessionPartInternal('init');

    triggerEntries([makeEntry({ duration: 60 }), makeEntry({ duration: 40 })]);

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const secondReport = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(secondReport).to.exist;
    expect(secondReport?.attributes['emb.tbd.loaf_total_duration']).to.equal(
      100,
    );
    expect(secondReport?.attributes['emb.tbd.loaf_count']).to.equal(2);
    expect(
      secondReport?.attributes['emb.tbd.loaf_longest_duration_excluding_first'],
    ).to.equal(60);

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

    spanSessionManager.endSessionPartInternal('web_inactivity');

    const report = memoryExporter
      .getFinishedLogRecords()
      .find((l) => l.eventName === 'emb-loaf-report');
    expect(
      report?.attributes['emb.tbd.loaf_style_and_layout_duration'],
    ).to.equal(0);

    instrumentation.disable();
  });

  it('should handle error in entry processing gracefully', () => {
    const diagLogger = new InMemoryDiagLogger();
    const instrumentation = new LoafInstrumentation({
      perf,
      diag: diagLogger,
    });
    instrumentation.setSessionManager(spanSessionManager);

    // Trigger an entry that will cause an error by passing a broken object
    triggerEntries([
      {
        get duration(): number {
          throw new Error('broken');
        },
      } as PerformanceLongAnimationFrameTiming,
    ]);

    expect(diagLogger.getErrorLogs().length).to.be.greaterThan(0);

    instrumentation.disable();
  });

  it('should handle error in flush report gracefully', () => {
    const diagLogger = new InMemoryDiagLogger();
    const instrumentation = new LoafInstrumentation({
      perf,
      diag: diagLogger,
    });
    instrumentation.setSessionManager(spanSessionManager);

    triggerEntries([makeEntry()]);

    // Sabotage the logger to trigger an error during flush
    const originalEmit = instrumentation['logger'].emit;
    instrumentation['logger'].emit = () => {
      throw new Error('emit failed');
    };

    spanSessionManager.endSessionPartInternal('web_inactivity');

    expect(diagLogger.getErrorLogs().length).to.be.greaterThan(0);

    instrumentation['logger'].emit = originalEmit;
    instrumentation.disable();
  });

  it('should handle enable() failure gracefully', () => {
    const original = globalThis.PerformanceObserver;
    // @ts-expect-error redefinition is intentional for testing
    globalThis.PerformanceObserver = class {
      public static supportedEntryTypes = ['long-animation-frame'];
      public constructor() {
        throw new Error('constructor failed');
      }
    };

    const diagLogger = new InMemoryDiagLogger();
    const instrumentation = new LoafInstrumentation({
      perf,
      diag: diagLogger,
    });
    instrumentation.setSessionManager(spanSessionManager);

    expect(diagLogger.getErrorLogs().length).to.be.greaterThan(0);

    globalThis.PerformanceObserver = original;
    instrumentation.disable();
  });

  describe('script summary', () => {
    it('should emit script summary log with correct aggregated data', () => {
      const instrumentation = new LoafInstrumentation({ perf });
      instrumentation.setSessionManager(spanSessionManager);

      triggerEntries([
        makeEntry({
          scripts: [
            makeScript({
              sourceURL: 'https://example.com/app.js',
              duration: 60,
              forcedStyleAndLayoutDuration: 10,
            }),
            makeScript({
              sourceURL: 'https://example.com/vendor.js',
              duration: 40,
              forcedStyleAndLayoutDuration: 5,
            }),
          ] as unknown as PerformanceLongAnimationFrameTiming['scripts'],
        }),
      ]);

      spanSessionManager.endSessionPartInternal('web_inactivity');

      const logs = memoryExporter.getFinishedLogRecords();
      const summary = logs.find((l) => l.eventName === 'emb-loaf-scripts');
      expect(summary).to.exist;
      expect(summary?.severityNumber).to.equal(SeverityNumber.INFO);
      expect(summary?.attributes['emb.type']).to.equal('ux.loaf_scripts');

      const body = JSON.parse(summary?.body as string);
      expect(body['https://example.com/app.js']).to.deep.equal({
        total_duration: 60,
        style_and_layout_duration: 10,
        count: 1,
      });
      expect(body['https://example.com/vendor.js']).to.deep.equal({
        total_duration: 40,
        style_and_layout_duration: 5,
        count: 1,
      });

      instrumentation.disable();
    });

    it('should group scripts by sourceURL across multiple LoAF entries', () => {
      const instrumentation = new LoafInstrumentation({ perf });
      instrumentation.setSessionManager(spanSessionManager);

      triggerEntries([
        makeEntry({
          scripts: [
            makeScript({
              sourceURL: 'https://example.com/app.js',
              duration: 60,
              forcedStyleAndLayoutDuration: 10,
            }),
          ] as unknown as PerformanceLongAnimationFrameTiming['scripts'],
        }),
        makeEntry({
          scripts: [
            makeScript({
              sourceURL: 'https://example.com/app.js',
              duration: 40,
              forcedStyleAndLayoutDuration: 20,
            }),
          ] as unknown as PerformanceLongAnimationFrameTiming['scripts'],
        }),
      ]);

      spanSessionManager.endSessionPartInternal('web_inactivity');

      const summary = memoryExporter
        .getFinishedLogRecords()
        .find((l) => l.eventName === 'emb-loaf-scripts');
      const body = JSON.parse(summary?.body as string);
      expect(body['https://example.com/app.js']).to.deep.equal({
        total_duration: 100,
        style_and_layout_duration: 30,
        count: 2,
      });

      instrumentation.disable();
    });

    it('should limit script entries to 250', () => {
      const instrumentation = new LoafInstrumentation({ perf });
      instrumentation.setSessionManager(spanSessionManager);

      // 251 scripts with unique URLs and incrementing durations (script 0 has lowest duration)
      const scripts = Array.from({ length: 251 }, (_, i) =>
        makeScript({
          sourceURL: `https://example.com/script-${i}.js`,
          duration: i + 1,
          forcedStyleAndLayoutDuration: 0,
        }),
      ) as unknown as PerformanceLongAnimationFrameTiming['scripts'];

      triggerEntries([makeEntry({ scripts })]);
      spanSessionManager.endSessionPartInternal('web_inactivity');

      const summary = memoryExporter
        .getFinishedLogRecords()
        .find((l) => l.eventName === 'emb-loaf-scripts');
      const body = JSON.parse(summary?.body as string);
      expect(Object.keys(body)).to.have.lengthOf(250);
      expect(body['https://example.com/script-0.js']).to.not.exist;
      expect(body['https://example.com/script-250.js']).to.exist;

      instrumentation.disable();
    });

    it('should not emit script summary log when no scripts present', () => {
      const instrumentation = new LoafInstrumentation({ perf });
      instrumentation.setSessionManager(spanSessionManager);

      triggerEntries([makeEntry({ scripts: [] })]);

      spanSessionManager.endSessionPartInternal('web_inactivity');

      const summaries = memoryExporter
        .getFinishedLogRecords()
        .filter((l) => l.eventName === 'emb-loaf-scripts');
      expect(summaries).to.have.lengthOf(0);

      instrumentation.disable();
    });

    it('should reset script summaries between sessions', () => {
      const instrumentation = new LoafInstrumentation({ perf });
      instrumentation.setSessionManager(spanSessionManager);

      triggerEntries([
        makeEntry({
          scripts: [
            makeScript({
              sourceURL: 'https://example.com/app.js',
              duration: 100,
              forcedStyleAndLayoutDuration: 10,
            }),
          ] as unknown as PerformanceLongAnimationFrameTiming['scripts'],
        }),
      ]);

      spanSessionManager.endSessionPartInternal('web_inactivity');
      memoryExporter.reset();

      spanSessionManager.startSessionPartInternal('init');

      triggerEntries([
        makeEntry({
          scripts: [
            makeScript({
              sourceURL: 'https://example.com/app.js',
              duration: 25,
              forcedStyleAndLayoutDuration: 5,
            }),
          ] as unknown as PerformanceLongAnimationFrameTiming['scripts'],
        }),
      ]);

      spanSessionManager.endSessionPartInternal('web_inactivity');

      const summary = memoryExporter
        .getFinishedLogRecords()
        .find((l) => l.eventName === 'emb-loaf-scripts');
      const body = JSON.parse(summary?.body as string);
      expect(body['https://example.com/app.js']).to.deep.equal({
        total_duration: 25,
        style_and_layout_duration: 5,
        count: 1,
      });

      instrumentation.disable();
    });

    it('should group scripts with empty sourceURL under (inline)', () => {
      const instrumentation = new LoafInstrumentation({ perf });
      instrumentation.setSessionManager(spanSessionManager);

      triggerEntries([
        makeEntry({
          scripts: [
            makeScript({
              sourceURL: '',
              duration: 30,
              forcedStyleAndLayoutDuration: 5,
            }),
            makeScript({
              sourceURL: '',
              duration: 20,
              forcedStyleAndLayoutDuration: 3,
            }),
          ] as unknown as PerformanceLongAnimationFrameTiming['scripts'],
        }),
      ]);

      spanSessionManager.endSessionPartInternal('web_inactivity');

      const summary = memoryExporter
        .getFinishedLogRecords()
        .find((l) => l.eventName === 'emb-loaf-scripts');
      const body = JSON.parse(summary?.body as string);
      expect(body['(inline)']).to.deep.equal({
        total_duration: 50,
        style_and_layout_duration: 8,
        count: 2,
      });

      instrumentation.disable();
    });

    it('should round float durations to integers in script summary', () => {
      const instrumentation = new LoafInstrumentation({ perf });
      instrumentation.setSessionManager(spanSessionManager);

      triggerEntries([
        makeEntry({ duration: 80 }),
        makeEntry({
          duration: 205.7,
          blockingDuration: 105.3,
          scripts: [
            makeScript({
              sourceURL: 'https://example.com/app.js',
              duration: 60.9,
              forcedStyleAndLayoutDuration: 10.4,
            }),
          ] as unknown as PerformanceLongAnimationFrameTiming['scripts'],
        }),
      ]);

      spanSessionManager.endSessionPartInternal('web_inactivity');

      const logs = memoryExporter.getFinishedLogRecords();
      const report = logs.find((l) => l.eventName === 'emb-loaf-report');
      expect(report?.attributes['emb.web_vital.value']).to.equal(105);
      expect(report?.attributes['emb.tbd.loaf_total_duration']).to.equal(286);

      const summary = logs.find((l) => l.eventName === 'emb-loaf-scripts');
      const body = JSON.parse(summary?.body as string);
      expect(body['https://example.com/app.js']).to.deep.equal({
        total_duration: 61,
        style_and_layout_duration: 10,
        count: 1,
      });

      instrumentation.disable();
    });

    it('should truncate script URLs longer than 2048 characters with ellipsis', () => {
      const instrumentation = new LoafInstrumentation({ perf });
      instrumentation.setSessionManager(spanSessionManager);

      const longURL = `https://example.com/${'a'.repeat(2100)}`;
      const truncatedURL = `https://example.com/${'a'.repeat(2028)}...`;

      triggerEntries([
        makeEntry({
          scripts: [
            makeScript({
              sourceURL: longURL,
              duration: 50,
              forcedStyleAndLayoutDuration: 5,
            }),
          ] as unknown as PerformanceLongAnimationFrameTiming['scripts'],
        }),
      ]);

      spanSessionManager.endSessionPartInternal('web_inactivity');

      const summary = memoryExporter
        .getFinishedLogRecords()
        .find((l) => l.eventName === 'emb-loaf-scripts');
      const body = JSON.parse(summary?.body as string);
      expect(body[longURL]).to.not.exist;
      expect(body[truncatedURL]).to.deep.equal({
        total_duration: 50,
        style_and_layout_duration: 5,
        count: 1,
      });

      instrumentation.disable();
    });
  });
});
