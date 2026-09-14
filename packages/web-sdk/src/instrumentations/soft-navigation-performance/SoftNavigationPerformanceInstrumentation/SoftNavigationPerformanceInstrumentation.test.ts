/* eslint-disable baseline-js/use-baseline */
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
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
import { SignalBuffer } from '../../../processors/utils/SignalBuffer.ts';
import {
  getNavigationEventTrigger,
  SoftNavigationPerformanceInstrumentation,
} from './SoftNavigationPerformanceInstrumentation.ts';
import type { PerformanceSoftNavigationTiming } from './types.ts';

const { expect } = chai;

let spanExporter: InMemorySpanExporter;

before(() => {
  spanExporter = setupTestTraceExporter();
});

const makeEntry = (
  overrides: Partial<PerformanceSoftNavigationTiming> = {},
): PerformanceSoftNavigationTiming =>
  ({
    name: 'https://example.com/next-page',
    entryType: 'soft-navigation',
    startTime: 200,
    duration: 50,
    navigationId: 1,
    interactionId: 7,
    paintTime: 230,
    presentationTime: 240,
    toJSON: () => ({}),
    ...overrides,
  }) as PerformanceSoftNavigationTiming;

type ObserverCallback = (list: {
  getEntries: () => PerformanceSoftNavigationTiming[];
}) => void;

type EventObserverCallback = (list: {
  getEntries: () => PerformanceEventTiming[];
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

// --- Polyfill test helpers ---

type MockClickEntry = PerformanceEventTiming;

const makeClickEntry = (
  overrides: Partial<MockClickEntry> = {},
): MockClickEntry =>
  ({
    name: 'click',
    entryType: 'event',
    startTime: 100,
    duration: 200,
    interactionId: 42,
    processingStart: 110,
    processingEnd: 120,
    cancelable: true,
    toJSON: () => ({}),
    ...overrides,
  }) as MockClickEntry;

let eventObserverCallback: EventObserverCallback | null = null;
let eventObserverDisconnected = false;
let eventObserveOptions: {
  type: string;
  buffered: boolean;
  durationThreshold?: number;
} | null = null;

let currentEntryChangeListeners: Array<(event: Event) => void> = [];

let mockNavigation: {
  currentEntry: { url: string } | null;
  addEventListener: (event: string, listener: () => void) => void;
  removeEventListener: (event: string, listener: () => void) => void;
};

class MockPolyfillPerformanceObserver {
  public static supportedEntryTypes = ['event'];
  private _callback: EventObserverCallback;

  public constructor(callback: EventObserverCallback) {
    this._callback = callback;
    eventObserverDisconnected = false;
  }

  public observe(options: {
    type: string;
    buffered: boolean;
    durationThreshold?: number;
  }): void {
    if (options.type === 'event') {
      eventObserverCallback = this._callback;
      eventObserveOptions = options;
    }
  }

  public disconnect(): void {
    eventObserverDisconnected = true;
  }
}

const triggerCurrentEntryChange = (timeStamp = performance.now()) => {
  for (const listener of currentEntryChangeListeners) {
    listener({ timeStamp } as Event);
  }
};

const triggerClickEntries = (entries: PerformanceEventTiming[]) => {
  eventObserverCallback?.({ getEntries: () => entries });
};

describe('SoftNavigationPerformanceInstrumentation', () => {
  let clock: sinon.SinonFakeTimers;
  let perf: MockPerformanceManager;
  let limitManager: EmbraceLimitManager;
  let originalPerformanceObserver: typeof globalThis.PerformanceObserver;

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
    instrumentation.enable();

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
    instrumentation.enable();

    triggerEntries([
      makeEntry({
        name: 'https://example.com/next-page',
        startTime: 200,
        duration: 50,
        navigationId: 1,
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
    expect(span.attributes['emb.soft_navigation.navigation_id']).to.equal(1);
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
    instrumentation.enable();

    triggerEntries([makeEntry({ startTime: 200, duration: 50 })]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.startTime).to.not.deep.equal(span.endTime);

    instrumentation.disable();
  });

  it('stamps span_ids and log_ids collected from the signal buffer for its window', () => {
    const signalBuffer = new SignalBuffer();
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      signalBuffer,
    });
    instrumentation.enable();

    signalBuffer.record({
      kind: 'span',
      id: 'child-span',
      startTime: perf.epochMillisFromOrigin(225),
      type: 'perf.network_request',
    });
    signalBuffer.record({
      kind: 'log',
      id: 'child-log',
      startTime: perf.epochMillisFromOrigin(240),
      type: 'sys.log',
    });
    signalBuffer.record({
      kind: 'span',
      id: 'outside-window',
      startTime: perf.epochMillisFromOrigin(300),
    });

    triggerEntries([makeEntry({ startTime: 200, duration: 50 })]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.attributes['emb.soft_navigation.span_ids']).to.deep.equal([
      'child-span',
    ]);
    expect(span.attributes['emb.soft_navigation.span_id_types']).to.deep.equal([
      'perf.network_request',
    ]);
    expect(span.attributes['emb.soft_navigation.log_ids']).to.deep.equal([
      'child-log',
    ]);
    expect(span.attributes['emb.soft_navigation.log_id_types']).to.deep.equal([
      'sys.log',
    ]);

    instrumentation.disable();
  });

  it('stamps an empty type when a correlated signal has no emb.type', () => {
    const signalBuffer = new SignalBuffer();
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      signalBuffer,
    });
    instrumentation.enable();

    signalBuffer.record({
      kind: 'span',
      id: 'child-span',
      startTime: perf.epochMillisFromOrigin(225),
    });

    triggerEntries([makeEntry({ startTime: 200, duration: 50 })]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.attributes['emb.soft_navigation.span_id_types']).to.deep.equal([
      '',
    ]);

    instrumentation.disable();
  });

  it('stamps empty arrays when the signal buffer has no matches in the window', () => {
    const signalBuffer = new SignalBuffer();
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      signalBuffer,
    });
    instrumentation.enable();

    triggerEntries([makeEntry({ startTime: 200, duration: 50 })]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.attributes['emb.soft_navigation.span_ids']).to.deep.equal([]);
    expect(span.attributes['emb.soft_navigation.span_id_types']).to.deep.equal(
      [],
    );
    expect(span.attributes['emb.soft_navigation.log_ids']).to.deep.equal([]);
    expect(span.attributes['emb.soft_navigation.log_id_types']).to.deep.equal(
      [],
    );

    instrumentation.disable();
  });

  it('does not stamp span_ids/log_ids when no signal buffer is provided', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });
    instrumentation.enable();

    triggerEntries([makeEntry({ startTime: 200, duration: 50 })]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.attributes).not.to.have.property(
      'emb.soft_navigation.span_ids',
    );
    expect(span.attributes).not.to.have.property(
      'emb.soft_navigation.span_id_types',
    );
    expect(span.attributes).not.to.have.property('emb.soft_navigation.log_ids');
    expect(span.attributes).not.to.have.property(
      'emb.soft_navigation.log_id_types',
    );

    instrumentation.disable();
  });

  it('should omit paint/presentation time attributes when undefined', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });
    instrumentation.enable();

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
    instrumentation.enable();

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
    instrumentation.enable();

    expect(observerCallback).to.be.null;

    instrumentation.disable();
  });

  it('should not emit spans after disable', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });
    instrumentation.enable();

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
    instrumentation.enable();

    triggerEntries([
      makeEntry({ navigationId: 0 }),
      makeEntry({ navigationId: 1 }),
      makeEntry({ navigationId: 2 }),
    ]);

    expect(spanExporter.getFinishedSpans()).to.have.length(2);

    instrumentation.disable();
  });

  it('should not enable twice', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });
    instrumentation.enable();
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
    instrumentation.enable();

    expect(diagLogger.getErrorLogs()[0]).to.equal('failed to enable');

    globalThis.PerformanceObserver = original;
    instrumentation.disable();
  });

  it('disconnects the existing observer when onEnable is called while already active', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
    });
    instrumentation.enable();

    const firstCallback = observerCallback;

    // Bypass the _isEnabled guard in enable() to re-enter _enableNative while
    // _observer is already set, exercising the disconnect() branch.
    instrumentation.onEnable();

    expect(observerCallback).to.not.equal(firstCallback);

    instrumentation.disable();
  });
});

describe('getNavigationEventTrigger', () => {
  it('returns the entry when the timestamp falls within the click window', () => {
    const entry = makeClickEntry({ startTime: 100, duration: 200 });
    expect(getNavigationEventTrigger(150, entry)).to.equal(entry);
  });

  it('returns the entry when the timestamp equals startTime', () => {
    const entry = makeClickEntry({ startTime: 100, duration: 200 });
    expect(getNavigationEventTrigger(100, entry)).to.equal(entry);
  });

  it('returns the entry when the timestamp equals startTime + duration', () => {
    const entry = makeClickEntry({ startTime: 100, duration: 200 });
    expect(getNavigationEventTrigger(300, entry)).to.equal(entry);
  });

  it('returns null when timestamp is before the click window', () => {
    const entry = makeClickEntry({ startTime: 100, duration: 200 });
    expect(getNavigationEventTrigger(99, entry)).to.be.null;
  });

  it('returns null when timestamp is after the click window', () => {
    const entry = makeClickEntry({ startTime: 100, duration: 200 });
    expect(getNavigationEventTrigger(301, entry)).to.be.null;
  });
});

describe('SoftNavigationPerformanceInstrumentation — polyfill', () => {
  let clock: sinon.SinonFakeTimers;
  let perf: MockPerformanceManager;
  let limitManager: EmbraceLimitManager;
  let originalPerformanceObserver: typeof globalThis.PerformanceObserver;

  beforeEach(() => {
    spanExporter.reset();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);
    limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);

    originalPerformanceObserver = globalThis.PerformanceObserver;

    currentEntryChangeListeners = [];
    eventObserverCallback = null;
    eventObserverDisconnected = false;
    eventObserveOptions = null;

    mockNavigation = {
      currentEntry: { url: 'https://example.com/new-page' },
      addEventListener: (_event: string, listener: () => void) => {
        currentEntryChangeListeners.push(listener);
      },
      removeEventListener: (_event: string, listener: () => void) => {
        const index = currentEntryChangeListeners.indexOf(listener);
        if (index !== -1) currentEntryChangeListeners.splice(index, 1);
      },
    };

    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      MockPolyfillPerformanceObserver;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      originalPerformanceObserver;
    clock.restore();
  });

  it('enables the polyfill when soft-navigation is not supported but Navigation API and event type are available', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    expect(eventObserveOptions).to.deep.include({
      type: 'event',
      buffered: true,
      durationThreshold: 16,
    });
    expect(currentEntryChangeListeners).to.have.length(1);

    instrumentation.disable();
  });

  it('emits a polyfill span when a click entry matches a pending navigation', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    // Simulate: user clicks at t=100, navigation commits at t=150
    clock.tick(150);
    triggerCurrentEntryChange();

    triggerClickEntries([
      makeClickEntry({ startTime: 100, duration: 200, interactionId: 42 }),
    ]);

    const spans = spanExporter.getFinishedSpans();
    expect(spans).to.have.length(1);
    const span = spans[0];
    expect(span.name).to.equal('Soft Navigation');
    expect(span.attributes['browser.url.full']).to.equal(
      'https://example.com/new-page',
    );
    expect(span.attributes['emb.soft_navigation.source']).to.equal('polyfill');
    expect(span.attributes['emb.soft_navigation.start_time']).to.equal(100);
    expect(span.attributes['emb.soft_navigation.duration']).to.equal(50); // 150 - 100
    expect(span.attributes['emb.soft_navigation.interaction_id']).to.equal(42);

    instrumentation.disable();
  });

  it('stamps span_ids and log_ids collected from the signal buffer for its window', () => {
    const signalBuffer = new SignalBuffer();
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      signalBuffer,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    // Click window is [100, 150] (navigation commits at t=150 below).
    signalBuffer.record({
      kind: 'span',
      id: 'child-span',
      startTime: perf.epochMillisFromOrigin(120),
      type: 'perf.network_request',
    });
    signalBuffer.record({
      kind: 'log',
      id: 'child-log',
      startTime: perf.epochMillisFromOrigin(140),
      type: 'sys.log',
    });
    signalBuffer.record({
      kind: 'span',
      id: 'outside-window',
      startTime: perf.epochMillisFromOrigin(200),
    });

    clock.tick(150);
    triggerCurrentEntryChange();

    triggerClickEntries([makeClickEntry({ startTime: 100, duration: 200 })]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.attributes['emb.soft_navigation.span_ids']).to.deep.equal([
      'child-span',
    ]);
    expect(span.attributes['emb.soft_navigation.span_id_types']).to.deep.equal([
      'perf.network_request',
    ]);
    expect(span.attributes['emb.soft_navigation.log_ids']).to.deep.equal([
      'child-log',
    ]);
    expect(span.attributes['emb.soft_navigation.log_id_types']).to.deep.equal([
      'sys.log',
    ]);

    instrumentation.disable();
  });

  it('span start is at click startTime and end is at navigation commit', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    clock.tick(150);
    triggerCurrentEntryChange();

    triggerClickEntries([makeClickEntry({ startTime: 100, duration: 200 })]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.startTime).to.not.deep.equal(span.endTime);

    instrumentation.disable();
  });

  it('does not emit a span when no click entry matches the navigation timestamp', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    clock.tick(500);
    triggerCurrentEntryChange();

    // click window is [100, 300], navigation at 500 → no match
    triggerClickEntries([makeClickEntry({ startTime: 100, duration: 200 })]);

    expect(spanExporter.getFinishedSpans()).to.have.length(0);

    instrumentation.disable();
  });

  it('skips a pending navigation and logs debug when currentEntry has no URL', () => {
    const diagLogger = new InMemoryDiagLogger();
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      diag: diagLogger,
      limitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    mockNavigation.currentEntry = null;
    clock.tick(150);
    triggerCurrentEntryChange();

    triggerClickEntries([makeClickEntry({ startTime: 100, duration: 200 })]);

    expect(spanExporter.getFinishedSpans()).to.have.length(0);
    expect(diagLogger.getDebugLogs()).to.include(
      'currententrychange fired with no URL, skipping',
    );

    instrumentation.disable();
  });

  it('prunes pending navigations older than 60 s when a click entry arrives', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    // Navigation at t=0 (will be older than 60 s by the time the click arrives).
    triggerCurrentEntryChange();

    // Navigation at t=100 (recent, should survive).
    clock.tick(100);
    triggerCurrentEntryChange();

    // Click arrives at t=60_100, so t=0 navigation is exactly 60_100 ms old (> 60_000)
    // and t=100 navigation is 60_000 ms old (not > 60_000, so it stays).
    // The click window covers [60_000, 60_200], which matches t=100... wait, 100 < 60_000.
    // Use a click at startTime=60_100 with a very large duration to match t=100.
    clock.tick(60_000); // t = 60_100
    triggerClickEntries([makeClickEntry({ startTime: 60_100, duration: 200 })]);

    // t=0 was pruned (60_100 - 0 = 60_100 > 60_000).
    // t=100 was pruned (60_100 - 100 = 60_000, not < 60_000).
    // No match → no span.
    expect(spanExporter.getFinishedSpans()).to.have.length(0);

    // Now verify a navigation within the 60 s window still matches.
    clock.tick(100); // t = 60_200
    triggerCurrentEntryChange(); // pending navigation at t=60_200
    triggerClickEntries([makeClickEntry({ startTime: 60_200, duration: 200 })]);

    expect(spanExporter.getFinishedSpans()).to.have.length(1);

    instrumentation.disable();
  });

  it('omits interaction_id when it is 0', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    clock.tick(150);
    triggerCurrentEntryChange();

    triggerClickEntries([
      makeClickEntry({ startTime: 100, duration: 200, interactionId: 0 }),
    ]);

    const span = spanExporter.getFinishedSpans()[0];
    expect(span.attributes).not.to.have.property(
      'emb.soft_navigation.interaction_id',
    );

    instrumentation.disable();
  });

  it('ignores non-click event entries', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    clock.tick(150);
    triggerCurrentEntryChange();

    triggerClickEntries([
      makeClickEntry({ name: 'keydown', startTime: 100, duration: 200 }),
    ]);

    expect(spanExporter.getFinishedSpans()).to.have.length(0);

    instrumentation.disable();
  });

  it('does not emit polyfill spans after disable', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    instrumentation.disable();

    expect(eventObserverDisconnected).to.be.true;
    expect(currentEntryChangeListeners).to.have.length(0);

    clock.tick(150);
    triggerClickEntries([makeClickEntry({ startTime: 100, duration: 200 })]);

    expect(spanExporter.getFinishedSpans()).to.have.length(0);
  });

  it('stops emitting once the soft_navigation limit is reached via polyfill', () => {
    const customLimitManager = new EmbraceLimitManager({
      ...DEFAULT_LIMITS,
      maxAllowed: { ...DEFAULT_LIMITS.maxAllowed, soft_navigation: 1 },
    });
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager: customLimitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    clock.tick(150);
    triggerCurrentEntryChange();
    mockNavigation.currentEntry = { url: 'https://example.com/page-2' };
    clock.tick(50);
    triggerCurrentEntryChange();

    triggerClickEntries([makeClickEntry({ startTime: 100, duration: 200 })]);

    expect(spanExporter.getFinishedSpans()).to.have.length(1);

    instrumentation.disable();
  });

  it('logs an error when the event observer fails to construct', () => {
    (globalThis as Record<string, unknown>)['PerformanceObserver'] = class {
      public static supportedEntryTypes = ['event'];
      public constructor() {
        throw new Error('constructor failed');
      }
    };

    const diagLogger = new InMemoryDiagLogger();
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      diag: diagLogger,
      limitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    expect(diagLogger.getErrorLogs()[0]).to.equal('failed to enable polyfill');
    expect(currentEntryChangeListeners).to.have.length(0);

    instrumentation.disable();
  });

  it('uses the destination URL from navigation.currentEntry at commit time', () => {
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    mockNavigation.currentEntry = { url: 'https://example.com/first' };
    clock.tick(150);
    triggerCurrentEntryChange();

    mockNavigation.currentEntry = { url: 'https://example.com/second' };
    clock.tick(50);
    triggerCurrentEntryChange();

    triggerClickEntries([makeClickEntry({ startTime: 100, duration: 200 })]);

    const spans = spanExporter.getFinishedSpans();
    expect(spans).to.have.length(1);
    expect(spans[0].attributes['browser.url.full']).to.equal(
      'https://example.com/first',
    );

    instrumentation.disable();
  });

  it('stops emitting in _emitPolyfillSpan once the limit is reached mid-batch', () => {
    const customLimitManager = new EmbraceLimitManager({
      ...DEFAULT_LIMITS,
      maxAllowed: { ...DEFAULT_LIMITS.maxAllowed, soft_navigation: 1 },
    });
    const instrumentation = new SoftNavigationPerformanceInstrumentation({
      perf,
      limitManager: customLimitManager,
      navigationHost: {
        navigation: mockNavigation as unknown as Navigation,
        location: { href: 'https://example.com', pathname: '/' },
      },
    });
    instrumentation.enable();

    // Two navigations at distinct timestamps so each click entry matches one.
    clock.tick(150); // t = 150
    triggerCurrentEntryChange();
    clock.tick(200); // t = 350
    triggerCurrentEntryChange();

    // Two click entries whose windows cover a different navigation each.
    // Entry 1: startTime=100, duration=100 → window [100, 200] matches t=150.
    // Entry 2: startTime=300, duration=100 → window [300, 400] matches t=350.
    triggerClickEntries([
      makeClickEntry({ startTime: 100, duration: 100 }),
      makeClickEntry({ startTime: 300, duration: 100 }),
    ]);

    // Only the first _emitPolyfillSpan call goes through; the second hits the limit guard.
    expect(spanExporter.getFinishedSpans()).to.have.length(1);

    instrumentation.disable();
  });
});
