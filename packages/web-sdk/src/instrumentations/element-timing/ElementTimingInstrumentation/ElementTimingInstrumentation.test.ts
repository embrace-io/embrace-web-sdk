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
import { ElementTimingInstrumentation } from './ElementTimingInstrumentation.ts';
import type { PerformanceElementTiming } from './types.ts';

const { expect } = chai;

const makeEntry = (
  overrides: Partial<PerformanceElementTiming> = {},
): PerformanceElementTiming =>
  ({
    name: '',
    entryType: 'element',
    startTime: 200,
    duration: 0,
    identifier: 'hero-image',
    element: { tagName: 'IMG' } as Element,
    renderTime: 200,
    loadTime: 180,
    url: 'https://example.com/hero.jpg',
    naturalWidth: 1200,
    naturalHeight: 800,
    intersectionRect: {} as DOMRectReadOnly,
    id: 'hero',
    toJSON: () => ({}),
    ...overrides,
  }) as PerformanceElementTiming;

type ObserverCallback = (list: {
  getEntries: () => PerformanceElementTiming[];
}) => void;

let observerCallback: ObserverCallback | null = null;
let observerDisconnected = false;
let observeOptions: { type: string; buffered: boolean } | null = null;

class MockPerformanceObserver {
  public static supportedEntryTypes = ['element'];
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

const triggerEntries = (entries: PerformanceElementTiming[]) => {
  observerCallback?.({ getEntries: () => entries });
};

describe('ElementTimingInstrumentation', () => {
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

  it('should observe element entries with buffered: true', () => {
    const instrumentation = new ElementTimingInstrumentation({
      perf,
      limitManager,
    });

    expect(observeOptions).to.deep.equal({ type: 'element', buffered: true });

    instrumentation.disable();
  });

  it('should emit a span for an element timing entry', () => {
    const instrumentation = new ElementTimingInstrumentation({
      perf,
      limitManager,
    });

    triggerEntries([
      makeEntry({
        identifier: 'hero-image',
        element: { tagName: 'IMG' } as Element,
        startTime: 200,
        renderTime: 200,
        loadTime: 180,
        url: 'https://example.com/hero.jpg',
        naturalWidth: 1200,
        naturalHeight: 800,
      }),
    ]);

    const spans = spanExporter.getFinishedSpans();
    expect(spans).to.have.length(1);
    const span = spans[0];
    expect(span.name).to.equal('hero-image');
    expect(span.attributes['emb.type']).to.equal('ux.element_timing');
    expect(span.attributes['emb.element_timing.identifier']).to.equal(
      'hero-image',
    );
    expect(span.attributes['emb.element_timing.element']).to.equal('img');
    expect(span.attributes['emb.element_timing.render_time']).to.equal(200);
    expect(span.attributes['emb.element_timing.load_time']).to.equal(180);
    expect(span.attributes['emb.element_timing.start_time']).to.equal(200);
    expect(span.attributes['emb.element_timing.url']).to.equal(
      'https://example.com/hero.jpg',
    );
    expect(span.attributes['emb.element_timing.natural_width']).to.equal(1200);
    expect(span.attributes['emb.element_timing.natural_height']).to.equal(800);

    expect(span.events).to.have.length(1);
    expect(span.events[0].name).to.equal('load');

    instrumentation.disable();
  });

  it('should not add a load event when loadTime is 0', () => {
    const instrumentation = new ElementTimingInstrumentation({
      perf,
      limitManager,
    });

    triggerEntries([
      makeEntry({ loadTime: 0, renderTime: 200, startTime: 200 }),
    ]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.events).to.have.length(0);

    instrumentation.disable();
  });

  it('should span from navigation start to element startTime', () => {
    clock.tick(1000);
    const timeOriginPerf = new MockPerformanceManager(clock);
    const instrumentation = new ElementTimingInstrumentation({
      perf: timeOriginPerf,
      limitManager,
    });

    triggerEntries([makeEntry({ startTime: 250 })]);

    const span = spanExporter.getFinishedSpans()[0];
    // start = epochMillisFromOriginOffset(0) = navigation epoch
    // end   = epochMillisFromOriginOffset(250) = navigation epoch + 250ms
    expect(span.startTime).to.not.deep.equal(span.endTime);

    instrumentation.disable();
  });

  it('should set element attribute to undefined when entry.element is null', () => {
    const instrumentation = new ElementTimingInstrumentation({
      perf,
      limitManager,
    });

    triggerEntries([makeEntry({ element: null })]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.attributes['emb.element_timing.element']).to.be.undefined;

    instrumentation.disable();
  });

  it('should not create an observer when element entry type is unsupported', () => {
    const diagLogger = new InMemoryDiagLogger();
    class UnsupportedMockPerformanceObserver extends MockPerformanceObserver {
      public static override supportedEntryTypes: string[] = [];
    }
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      UnsupportedMockPerformanceObserver;

    const instrumentation = new ElementTimingInstrumentation({
      perf,
      diag: diagLogger,
      limitManager,
    });

    expect(observerCallback).to.be.null;
    expect(diagLogger.getDebugLogs().some((m) => m.includes('element'))).to.be
      .true;

    instrumentation.disable();
  });

  it('should not emit spans after disable', () => {
    const instrumentation = new ElementTimingInstrumentation({
      perf,
      limitManager,
    });

    instrumentation.disable();

    expect(observerDisconnected).to.be.true;

    triggerEntries([makeEntry({ identifier: 'late-element' })]);

    expect(spanExporter.getFinishedSpans()).to.have.length(0);
  });

  it('stops emitting once the element_timing limit is reached', () => {
    const customLimitManager = new EmbraceLimitManager({
      ...DEFAULT_LIMITS,
      maxAllowed: { ...DEFAULT_LIMITS.maxAllowed, element_timing: 2 },
    });
    const instrumentation = new ElementTimingInstrumentation({
      perf,
      limitManager: customLimitManager,
    });

    triggerEntries([
      makeEntry({ identifier: 'el-0' }),
      makeEntry({ identifier: 'el-1' }),
      makeEntry({ identifier: 'el-2' }),
    ]);

    expect(spanExporter.getFinishedSpans()).to.have.length(2);

    instrumentation.disable();
  });

  it('should not enable twice', () => {
    const instrumentation = new ElementTimingInstrumentation({
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
      public static supportedEntryTypes = ['element'];
      public constructor() {
        throw new Error('constructor failed');
      }
    };

    const diagLogger = new InMemoryDiagLogger();
    const instrumentation = new ElementTimingInstrumentation({
      perf,
      diag: diagLogger,
      limitManager,
    });

    expect(diagLogger.getErrorLogs()[0]).to.equal('failed to enable');

    globalThis.PerformanceObserver = original;
    instrumentation.disable();
  });
});
