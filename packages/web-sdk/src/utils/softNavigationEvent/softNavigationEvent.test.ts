import * as chai from 'chai';
import { installSoftNavigationEvent } from './softNavigationEvent.ts';
import type { SoftNavigationDetail } from './types.ts';
import { SOFT_NAVIGATION_EVENT } from './types.ts';

const { expect } = chai;

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
  let teardown: () => void;
  let originalPerformanceObserver: typeof globalThis.PerformanceObserver;
  let originalUrl: string;

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

    teardown = () => {};
    history.replaceState(null, '', HOME);
  });

  afterEach(() => {
    teardown();
    history.replaceState(null, '', originalUrl);
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      originalPerformanceObserver;
  });

  it('fires once after pointerdown then pushState', async () => {
    teardown = installSoftNavigationEvent();
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.pushState(null, '', PATH_A);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(1);
    const detail = captured.events[0];
    expect(detail.url).to.match(/page-a$/);
    expect(detail.previousUrl).to.match(/\/$/);
    expect(detail.startTime).to.be.at.most(detail.paintTime);
    expect(detail.navigationId).to.be.a('string');
    expect(detail.navigationId.length).to.be.greaterThan(0);

    captured.remove();
  });

  it('fires after keydown then replaceState', async () => {
    teardown = installSoftNavigationEvent();
    const captured = captureEvents();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    history.replaceState(null, '', PATH_A);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(1);
    expect(captured.events[0].url).to.match(/page-a$/);

    captured.remove();
  });

  it('fires on popstate after a click-driven back navigation', async () => {
    teardown = installSoftNavigationEvent();
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
    teardown = installSoftNavigationEvent();
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
    teardown = installSoftNavigationEvent();
    const captured = captureEvents();

    history.pushState(null, '', PATH_A);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(0);
    captured.remove();
  });

  it('does not fire when the interaction is older than the timeout', async () => {
    teardown = installSoftNavigationEvent({ interactionTimeoutMs: 50 });
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    await wait(120);
    history.pushState(null, '', PATH_A);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(0);
    captured.remove();
  });

  it('does not fire when pushState targets the current URL', async () => {
    teardown = installSoftNavigationEvent();
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.pushState(null, '', window.location.href);

    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(0);
    captured.remove();
  });

  it('fires only once for two rapid pushStates after a single click', async () => {
    teardown = installSoftNavigationEvent();
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
    teardown = installSoftNavigationEvent();
    const captured = captureEvents();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.pushState(null, '', PATH_A);
    await waitForFrames(3);
    expect(captured.events).to.have.lengthOf(1);

    teardown();
    teardown = () => {};
    captured.events.length = 0;

    window.dispatchEvent(new PointerEvent('pointerdown'));
    history.pushState(null, '', PATH_B);
    await waitForFrames(3);

    expect(captured.events).to.have.lengthOf(0);
    captured.remove();
  });

  it('uses the native PerformanceObserver bridge when soft-navigation entries are supported', async () => {
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

    teardown = installSoftNavigationEvent();
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
      url: '/native-route',
      startTime: 100,
      paintTime: 142,
      navigationId: 'native-id',
    });
    events.remove();
  });
});
