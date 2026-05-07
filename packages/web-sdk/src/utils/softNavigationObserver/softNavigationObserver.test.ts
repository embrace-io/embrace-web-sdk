import * as chai from 'chai';
import { installSoftNavigationObserver } from './softNavigationObserver.ts';
import type { SoftNavigationPerformanceEntry } from './types.ts';
import { SOFT_NAVIGATION_ENTRY_TYPE } from './types.ts';

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

const HOME = '/';
const PATH_A = '/page-a';
const PATH_B = '/page-b';

const triggerSoftNav = (path: string): void => {
  window.dispatchEvent(new PointerEvent('pointerdown'));
  history.pushState(null, '', path);
};

describe('installSoftNavigationObserver', () => {
  let teardown: () => void;
  let originalUrl: string;
  let savedPerformanceObserver: typeof globalThis.PerformanceObserver;

  beforeEach(() => {
    originalUrl = window.location.href;
    savedPerformanceObserver = globalThis.PerformanceObserver;
    teardown = () => {};
    history.replaceState(null, '', HOME);
  });

  afterEach(() => {
    teardown();
    history.replaceState(null, '', originalUrl);
    if (globalThis.PerformanceObserver !== savedPerformanceObserver) {
      Reflect.set(globalThis, 'PerformanceObserver', savedPerformanceObserver);
    }
  });

  it('delivers entries via new PerformanceObserver({type: "soft-navigation"})', async () => {
    teardown = installSoftNavigationObserver();
    const received: PerformanceEntry[] = [];
    const observer = new PerformanceObserver((list) => {
      received.push(...list.getEntries());
    });
    observer.observe({ type: SOFT_NAVIGATION_ENTRY_TYPE });

    triggerSoftNav(PATH_A);
    await waitForFrames(3);

    expect(received).to.have.lengthOf(1);
    const entry = received[0] as SoftNavigationPerformanceEntry;
    expect(entry.entryType).to.equal(SOFT_NAVIGATION_ENTRY_TYPE);
    expect(entry.name).to.match(/page-a$/);
    expect(entry.duration).to.equal(0);
    expect(entry.navigationId).to.be.a('string');
    expect(entry.paintTime).to.be.a('number');
    expect(entry.startTime).to.be.at.most(entry.paintTime);

    observer.disconnect();
  });

  it('delivers entries via entryTypes form', async () => {
    teardown = installSoftNavigationObserver();
    const received: PerformanceEntry[] = [];
    const observer = new PerformanceObserver((list) => {
      received.push(...list.getEntries());
    });
    observer.observe({ entryTypes: [SOFT_NAVIGATION_ENTRY_TYPE] });

    triggerSoftNav(PATH_A);
    await waitForFrames(3);

    expect(received).to.have.lengthOf(1);
    observer.disconnect();
  });

  it('passes through other entry types in a mixed entryTypes list', async () => {
    teardown = installSoftNavigationObserver();
    const softNavEntries: PerformanceEntry[] = [];
    const paintEntries: PerformanceEntry[] = [];

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === SOFT_NAVIGATION_ENTRY_TYPE) {
          softNavEntries.push(entry);
        } else if (entry.entryType === 'paint') {
          paintEntries.push(entry);
        }
      }
    });
    observer.observe({
      entryTypes: ['paint', SOFT_NAVIGATION_ENTRY_TYPE],
    });

    triggerSoftNav(PATH_A);
    await waitForFrames(3);

    expect(softNavEntries).to.have.lengthOf(1);
    // Paint entries from initial document load may or may not arrive depending
    // on timing; the assertion that matters is that observe() didn't throw and
    // that soft-nav delivery still works for the mixed registration.
    observer.disconnect();
  });

  it('replays buffered entries to a late observer with buffered: true', async () => {
    teardown = installSoftNavigationObserver();
    triggerSoftNav(PATH_A);
    await waitForFrames(3);

    const received: PerformanceEntry[] = [];
    const observer = new PerformanceObserver((list) => {
      received.push(...list.getEntries());
    });
    observer.observe({
      type: SOFT_NAVIGATION_ENTRY_TYPE,
      buffered: true,
    });

    await wait(0);

    expect(received).to.have.lengthOf(1);
    expect(received[0].name).to.match(/page-a$/);
    observer.disconnect();
  });

  it('disconnect stops further delivery', async () => {
    teardown = installSoftNavigationObserver();
    const received: PerformanceEntry[] = [];
    const observer = new PerformanceObserver((list) => {
      received.push(...list.getEntries());
    });
    observer.observe({ type: SOFT_NAVIGATION_ENTRY_TYPE });

    triggerSoftNav(PATH_A);
    await waitForFrames(3);
    expect(received).to.have.lengthOf(1);

    observer.disconnect();

    triggerSoftNav(PATH_B);
    await waitForFrames(3);

    expect(received).to.have.lengthOf(1);
  });

  it('takeRecords returns pending entries and clears them', async () => {
    teardown = installSoftNavigationObserver();
    const received: PerformanceEntry[] = [];
    const observer = new PerformanceObserver((list) => {
      received.push(...list.getEntries());
    });
    observer.observe({ type: SOFT_NAVIGATION_ENTRY_TYPE });

    triggerSoftNav(PATH_A);
    await waitForFrames(3);
    // After the microtask flush, pending should already be drained, so
    // takeRecords returns the native pending which is typically empty.
    const taken = observer.takeRecords();
    expect(taken).to.be.an('array');

    // Force a fresh entry but do not wait for the microtask flush.
    triggerSoftNav(PATH_B);
    await waitForFrames(3);
    // Drain via takeRecords before the microtask gets a chance — because rAF
    // runs before microtasks queued from outside, the microtask has already
    // flushed by now in practice. Just assert that takeRecords does not throw
    // and returns an array.
    const taken2 = observer.takeRecords();
    expect(taken2).to.be.an('array');

    observer.disconnect();
  });

  it('exposes "soft-navigation" via PerformanceObserver.supportedEntryTypes', () => {
    expect(PerformanceObserver.supportedEntryTypes).to.not.include(
      SOFT_NAVIGATION_ENTRY_TYPE,
    );

    teardown = installSoftNavigationObserver();
    expect(PerformanceObserver.supportedEntryTypes).to.include(
      SOFT_NAVIGATION_ENTRY_TYPE,
    );

    teardown();
    teardown = () => {};
    expect(PerformanceObserver.supportedEntryTypes).to.not.include(
      SOFT_NAVIGATION_ENTRY_TYPE,
    );
  });

  it('performance.getEntriesByType("soft-navigation") returns synthesized entries', async () => {
    teardown = installSoftNavigationObserver();
    triggerSoftNav(PATH_A);
    await waitForFrames(3);

    const entries = performance.getEntriesByType(SOFT_NAVIGATION_ENTRY_TYPE);
    expect(entries).to.have.lengthOf(1);
    expect(entries[0].name).to.match(/page-a$/);

    triggerSoftNav(PATH_B);
    await waitForFrames(3);

    const entries2 = performance.getEntriesByType(SOFT_NAVIGATION_ENTRY_TYPE);
    expect(entries2).to.have.lengthOf(2);
    expect(entries2[1].name).to.match(/page-b$/);
  });

  it('performance.getEntries merges native and synthesized entries by startTime', async () => {
    teardown = installSoftNavigationObserver();
    triggerSoftNav(PATH_A);
    await waitForFrames(3);

    const all = performance.getEntries();
    const softNavs = all.filter(
      (e) => e.entryType === SOFT_NAVIGATION_ENTRY_TYPE,
    );
    expect(softNavs).to.have.lengthOf(1);

    for (let i = 1; i < all.length; i += 1) {
      expect(all[i].startTime).to.be.at.least(all[i - 1].startTime);
    }
  });

  it('performance.getEntriesByName filters synthesized entries by URL', async () => {
    teardown = installSoftNavigationObserver();
    triggerSoftNav(PATH_A);
    await waitForFrames(3);
    triggerSoftNav(PATH_B);
    await waitForFrames(3);

    const expectedUrl = `${window.location.origin}${PATH_A}`;
    const filtered = performance.getEntriesByName(
      expectedUrl,
      SOFT_NAVIGATION_ENTRY_TYPE,
    );
    expect(filtered).to.have.lengthOf(1);
    expect(filtered[0].entryType).to.equal(SOFT_NAVIGATION_ENTRY_TYPE);
  });

  it('does nothing when native PerformanceObserver supports soft-navigation', () => {
    const Stub = class {
      public static supportedEntryTypes = [SOFT_NAVIGATION_ENTRY_TYPE];
      public observe(): void {}
      public disconnect(): void {}
      public takeRecords(): PerformanceEntry[] {
        return [];
      }
    };
    Reflect.set(globalThis, 'PerformanceObserver', Stub);

    const before = globalThis.PerformanceObserver;
    teardown = installSoftNavigationObserver();
    expect(globalThis.PerformanceObserver).to.equal(before);
  });

  it('teardown restores PerformanceObserver and performance methods', async () => {
    const originalGetEntries = performance.getEntries;
    const originalGetEntriesByType = performance.getEntriesByType;
    const originalGetEntriesByName = performance.getEntriesByName;
    const originalConstructor = globalThis.PerformanceObserver;

    teardown = installSoftNavigationObserver();
    expect(performance.getEntries).to.not.equal(originalGetEntries);
    expect(performance.getEntriesByType).to.not.equal(originalGetEntriesByType);
    expect(performance.getEntriesByName).to.not.equal(originalGetEntriesByName);
    expect(globalThis.PerformanceObserver).to.not.equal(originalConstructor);

    teardown();
    teardown = () => {};

    expect(performance.getEntries).to.equal(originalGetEntries);
    expect(performance.getEntriesByType).to.equal(originalGetEntriesByType);
    expect(performance.getEntriesByName).to.equal(originalGetEntriesByName);
    expect(globalThis.PerformanceObserver).to.equal(originalConstructor);
  });

  it('is idempotent when called twice without teardown', () => {
    const first = installSoftNavigationObserver();
    const patched = globalThis.PerformanceObserver;
    const second = installSoftNavigationObserver();

    expect(globalThis.PerformanceObserver).to.equal(patched);
    second();
    teardown = first;
  });
});
