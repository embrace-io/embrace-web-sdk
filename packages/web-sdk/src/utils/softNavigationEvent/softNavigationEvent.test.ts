import * as chai from 'chai';
import { installSoftNavigationEvent } from './softNavigationEvent.ts';
import type { SoftNavigationDetail, SoftNavigationOptions } from './types.ts';
import { SOFT_NAVIGATION_EVENT } from './types.ts';

const { expect } = chai;

const SDK_SIDE_SOURCES = new Set(['navigation-api', 'history']);

const waitForFrames = (count: number): Promise<DOMHighResTimeStamp> =>
  new Promise<DOMHighResTimeStamp>((resolve) => {
    let remaining = count;
    const tick = (timestamp: DOMHighResTimeStamp) => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve(timestamp);
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const captureEvents = (): {
  events: SoftNavigationDetail[];
  remove: () => void;
} => {
  const events: SoftNavigationDetail[] = [];
  const handler = (event: CustomEvent<SoftNavigationDetail>) => {
    events.push(event.detail);
  };
  window.addEventListener(SOFT_NAVIGATION_EVENT, handler);
  return {
    events,
    remove: () => window.removeEventListener(SOFT_NAVIGATION_EVENT, handler),
  };
};

const HOME = '/';
const PATH_A = '/page-a';
const PATH_B = '/page-b';

describe('installSoftNavigationEvent', () => {
  const teardowns: Array<() => void> = [];
  let originalPerformanceObserver: typeof globalThis.PerformanceObserver;
  let originalUrl: string;

  const install = (options?: SoftNavigationOptions): (() => void) => {
    const teardown = installSoftNavigationEvent(options);
    teardowns.push(teardown);
    return teardown;
  };

  beforeEach(() => {
    originalUrl = window.location.href;
    originalPerformanceObserver = globalThis.PerformanceObserver;

    const Stub = class {
      public static supportedEntryTypes: string[] = [];
      public observe(): void {}
      public disconnect(): void {}
      public takeRecords(): PerformanceEntry[] {
        return [];
      }
    };
    (globalThis as Record<string, unknown>)['PerformanceObserver'] = Stub;

    history.replaceState(null, '', HOME);
  });

  afterEach(() => {
    while (teardowns.length > 0) {
      teardowns.pop()?.();
    }
    history.replaceState(null, '', originalUrl);
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      originalPerformanceObserver;
  });

  it('fires once after pointerdown then pushState', async () => {
    install();
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.pushState(null, '', PATH_A);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(1);
    const detail = captured.events[0];
    expect(SDK_SIDE_SOURCES.has(detail.source)).to.equal(true);
    expect(detail.url).to.match(/page-a$/);
    expect(detail.previousUrl).to.match(/\/$/);
    expect(detail.startTime).to.be.at.most(detail.paintTime);
    expect(detail.navigationId).to.be.a('string');
    expect(detail.navigationId.length).to.be.greaterThan(0);

    captured.remove();
  });

  it('fires after keydown then replaceState', async () => {
    install();
    const captured = captureEvents();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    history.replaceState(null, '', PATH_A);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(1);
    expect(captured.events[0].url).to.match(/page-a$/);

    captured.remove();
  });

  it('fires on popstate after a click-driven back navigation', async () => {
    install();
    history.pushState(null, '', PATH_A);
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.back();

    await wait(50);
    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(1);
    expect(captured.events[0].url).to.match(/\/$/);
    expect(captured.events[0].previousUrl).to.match(/page-a$/);

    captured.remove();
  });

  it('fires on hashchange after a click', async () => {
    install();
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    window.location.hash = 'section-1';

    await wait(20);
    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(1);
    expect(captured.events[0].url).to.contain('#section-1');

    captured.remove();
  });

  it('does not fire when pushState happens with no preceding interaction', async () => {
    install();
    const captured = captureEvents();

    history.pushState(null, '', PATH_A);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(0);
    captured.remove();
  });

  it('does not fire when the interaction is older than the timeout', async () => {
    install({ interactionTimeoutMs: 50 });
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    await wait(120);
    history.pushState(null, '', PATH_A);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(0);
    captured.remove();
  });

  it('does not fire when pushState targets the current URL', async () => {
    install();
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.pushState(null, '', window.location.href);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(0);
    captured.remove();
  });

  it('fires only once for two rapid pushStates after a single click', async () => {
    install();
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.pushState(null, '', PATH_A);
    history.pushState(null, '', PATH_B);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(1);
    expect(captured.events[0].url).to.match(/page-a$/);
    captured.remove();
  });

  it('teardown stops further events', async () => {
    const teardown = install();
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.pushState(null, '', PATH_A);
    await waitForFrames(3);
    expect(captured.events).to.have.lengthOf(1);

    teardown();
    captured.events.length = 0;

    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.pushState(null, '', PATH_B);
    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(0);
    captured.remove();
  });

  it('uses the native PerformanceObserver bridge when soft-navigation entries are supported', () => {
    type ObserverCallback = (list: {
      getEntries: () => PerformanceEntry[];
    }) => void;

    const observerState: { cb: ObserverCallback | null } = { cb: null };
    const Stub = class {
      public static supportedEntryTypes = ['soft-navigation'];
      public constructor(cb: ObserverCallback) {
        observerState.cb = cb;
      }
      public observe(): void {}
      public disconnect(): void {}
      public takeRecords(): PerformanceEntry[] {
        return [];
      }
    };
    (globalThis as Record<string, unknown>)['PerformanceObserver'] = Stub;

    const originalPushState = history.pushState;

    install();
    expect(history.pushState).to.equal(originalPushState);
    expect(observerState.cb).to.not.be.null;

    const events = captureEvents();

    const entry = {
      name: '/native-route',
      entryType: 'soft-navigation',
      startTime: 100,
      duration: 0,
      paintTime: 142,
      navigationId: 'native-id',
      toJSON: () => ({}),
    } as unknown as PerformanceEntry;

    observerState.cb?.({ getEntries: () => [entry] });

    expect(events.events).to.have.lengthOf(1);
    expect(events.events[0]).to.deep.include({
      source: 'soft-navigation-entry',
      url: '/native-route',
      startTime: 100,
      paintTime: 142,
      navigationId: 'native-id',
    });
    events.remove();
  });

  it('falls back when native PerformanceObserver throws during observe', async () => {
    const Stub = class {
      public static supportedEntryTypes = ['soft-navigation'];
      public observe(): void {
        throw new Error('observe rejected');
      }
      public disconnect(): void {}
      public takeRecords(): PerformanceEntry[] {
        return [];
      }
    };
    (globalThis as Record<string, unknown>)['PerformanceObserver'] = Stub;

    install();
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.pushState(null, '', PATH_A);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(1);
    expect(SDK_SIDE_SOURCES.has(captured.events[0].source)).to.equal(true);
    captured.remove();
  });

  it('re-install after teardown does not chain history wrappers', async () => {
    const firstTeardown = install();
    const wrappedOnce = history.pushState;
    firstTeardown();
    expect(history.pushState).to.equal(wrappedOnce);

    install();
    expect(history.pushState).to.equal(wrappedOnce);

    const captured = captureEvents();
    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.pushState(null, '', PATH_A);
    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(1);
    captured.remove();
  });
});
