/* eslint-disable baseline-js/use-baseline */
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  InMemoryDiagLogger,
  MockPerformanceManager,
  setupTestTraceExporter,
} from '../../../../tests/utils/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
} from '../../../managers/index.ts';
import { SoftNavigationPerformanceInstrumentation } from './SoftNavigationPerformanceInstrumentation.ts';
import type { PerformanceSoftNavigationTiming } from './types.ts';

const { expect } = chai;

const makeEntry = (
  overrides: Partial<PerformanceSoftNavigationTiming> = {},
): PerformanceSoftNavigationTiming =>
  ({
    name: 'https://example.com/next-page',
    entryType: 'soft-navigation',
    startTime: 200,
    duration: 50,
    navigationId: 'nav-1',
    interactionId: 7,
    paintTime: 230,
    presentationTime: 240,
    toJSON: () => ({}),
    ...overrides,
  }) as PerformanceSoftNavigationTiming;

type ObserverCallback = (list: {
  getEntries: () => PerformanceSoftNavigationTiming[];
}) => void;

let observerCallback: ObserverCallback | null = null;
let observerDisconnected = false;
let observeOptions: { type: string; buffered: boolean } | null = null;

class MockPerformanceObserver {
  public static supportedEntryTypes = ['soft-navigation'];
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

const triggerEntries = (entries: PerformanceSoftNavigationTiming[]) => {
  observerCallback?.({ getEntries: () => entries });
};

describe('SoftNavigationPerformanceInstrumentation', () => {
  let spanExporter: InMemorySpanExporter;
  let clock: sinon.SinonFakeTimers;
  let perf: MockPerformanceManager;
  let limitManager: EmbraceLimitManager;
  let originalPerformanceObserver: typeof globalThis.PerformanceObserver;

  before(() => {
    spanExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    spanExporter.reset();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);
    limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);

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

  it('should observe soft-navigation entries with buffered: true', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });

    expect(observeOptions).to.deep.equal({
      type: 'soft-navigation',
      buffered: true,
    });

    instrumentation.disable();
  });

  it('should emit a span for a soft-navigation entry', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });

    triggerEntries([
      makeEntry({
        name: 'https://example.com/next-page',
        startTime: 200,
        duration: 50,
        navigationId: 'nav-1',
        interactionId: 7,
        paintTime: 230,
        presentationTime: 240,
      }),
    ]);

    const spans = spanExporter.getFinishedSpans();
    expect(spans).to.have.length(1);
    const span = spans[0];
    expect(span.name).to.equal('Soft Navigation');
    expect(span.attributes['browser.url.full']).to.equal(
      'https://example.com/next-page',
    );
    expect(span.attributes['emb.soft_navigation.source']).to.equal(
      'performance_observer',
    );
    expect(span.attributes['emb.soft_navigation.navigation_id']).to.equal(
      'nav-1',
    );
    expect(span.attributes['emb.soft_navigation.interaction_id']).to.equal(7);
    expect(span.attributes['emb.soft_navigation.start_time']).to.equal(200);
    expect(span.attributes['emb.soft_navigation.duration']).to.equal(50);
    expect(span.attributes['emb.soft_navigation.paint_time']).to.equal(230);
    expect(span.attributes['emb.soft_navigation.presentation_time']).to.equal(
      240,
    );

    instrumentation.disable();
  });

  it('should span from startTime to startTime + duration', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });

    triggerEntries([makeEntry({ startTime: 200, duration: 50 })]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.startTime).to.not.deep.equal(span.endTime);

    instrumentation.disable();
  });

  it('should omit paint/presentation time attributes when undefined', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });

    triggerEntries([
      makeEntry({ paintTime: undefined, presentationTime: undefined }),
    ]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.attributes).not.to.have.property(
      'emb.soft_navigation.paint_time',
    );
    expect(span.attributes).not.to.have.property(
      'emb.soft_navigation.presentation_time',
    );

    instrumentation.disable();
  });

  it('should omit paint/presentation time attributes when null', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });

    triggerEntries([makeEntry({ paintTime: null, presentationTime: null })]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.attributes).not.to.have.property(
      'emb.soft_navigation.paint_time',
    );
    expect(span.attributes).not.to.have.property(
      'emb.soft_navigation.presentation_time',
    );

    instrumentation.disable();
  });

  it('should not create an observer when soft-navigation entry type is unsupported', () => {
    const diagLogger = new InMemoryDiagLogger();
    class UnsupportedMockPerformanceObserver extends MockPerformanceObserver {
      public static override supportedEntryTypes: string[] = [];
    }
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      UnsupportedMockPerformanceObserver;

    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      diag: diagLogger,
      limitManager,
    });

    expect(observerCallback).to.be.null;
    expect(diagLogger.getDebugLogs().some((m) => m.includes('soft-navigation')))
      .to.be.true;

    instrumentation.disable();
  });

  it('should not emit spans after disable', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });

    instrumentation.disable();

    expect(observerDisconnected).to.be.true;

    triggerEntries([makeEntry()]);

    expect(spanExporter.getFinishedSpans()).to.have.length(0);
  });

  it('stops emitting once the soft_navigation limit is reached', () => {
    const customLimitManager = new EmbraceLimitManager({
      ...DEFAULT_LIMITS,
      maxAllowed: { ...DEFAULT_LIMITS.maxAllowed, soft_navigation: 2 },
    });
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager: customLimitManager,
    });

    triggerEntries([
      makeEntry({ navigationId: 'nav-0' }),
      makeEntry({ navigationId: 'nav-1' }),
      makeEntry({ navigationId: 'nav-2' }),
    ]);

    expect(spanExporter.getFinishedSpans()).to.have.length(2);

    instrumentation.disable();
  });

  it('should not enable twice', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });
    const firstCallback = observerCallback;

    instrumentation.enable();

    expect(observerCallback).to.equal(firstCallback);

    instrumentation.disable();
  });

  it('logs an error when the observer fails to construct', () => {
    const original = globalThis.PerformanceObserver;
    // @ts-expect-error redefinition is intentional for testing
    globalThis.PerformanceObserver = class {
      public static supportedEntryTypes = ['soft-navigation'];
      public constructor() {
        throw new Error('constructor failed');
      }
    };

    const diagLogger = new InMemoryDiagLogger();
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      diag: diagLogger,
      limitManager,
    });

    expect(diagLogger.getErrorLogs()[0]).to.equal('failed to enable');

    globalThis.PerformanceObserver = original;
    instrumentation.disable();
  });
});
