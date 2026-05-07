import { generateUUID } from '../generateUUID.ts';
import { isEntryTypeSupported } from '../performanceObserver/performanceObserver.ts';
import type {
  SoftNavigationObserverOptions,
  SoftNavigationPerformanceEntry,
} from './types.ts';
import { SOFT_NAVIGATION_ENTRY_TYPE } from './types.ts';

const DEFAULT_INTERACTION_TIMEOUT_MS = 500;
const DEFAULT_BUFFER_SIZE = 100;

class SoftNavigationEntry implements SoftNavigationPerformanceEntry {
  public readonly entryType = SOFT_NAVIGATION_ENTRY_TYPE;
  public readonly duration = 0 as const;
  public readonly name: string;
  public readonly startTime: number;
  public readonly navigationId: string;
  public readonly paintTime: number;

  public constructor(args: {
    name: string;
    startTime: number;
    paintTime: number;
    navigationId: string;
  }) {
    this.name = args.name;
    this.startTime = args.startTime;
    this.paintTime = args.paintTime;
    this.navigationId = args.navigationId;
  }

  public toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      navigationId: this.navigationId,
      paintTime: this.paintTime,
    };
  }
}

interface SoftNavSubscription {
  callback: PerformanceObserverCallback;
  observer: PerformanceObserver;
  pending: SoftNavigationEntry[];
  bufferedReplayed: boolean;
  active: boolean;
}

interface NavigateEvent extends Event {
  destination: { sameDocument: boolean; url: string };
  navigationType: 'push' | 'replace' | 'traverse' | 'reload';
}

interface NavigationAPI {
  addEventListener(
    type: 'navigate',
    listener: (event: NavigateEvent) => void,
  ): void;
  addEventListener(type: 'navigatesuccess', listener: () => void): void;
  addEventListener(type: 'navigateerror', listener: () => void): void;
  removeEventListener(
    type: 'navigate',
    listener: (event: NavigateEvent) => void,
  ): void;
  removeEventListener(type: 'navigatesuccess', listener: () => void): void;
  removeEventListener(type: 'navigateerror', listener: () => void): void;
}

let installed = false;

const noop = () => {};

const containsSoftNav = (init: PerformanceObserverInit): boolean => {
  if (init.type === SOFT_NAVIGATION_ENTRY_TYPE) {
    return true;
  }
  if (
    Array.isArray(init.entryTypes) &&
    init.entryTypes.includes(SOFT_NAVIGATION_ENTRY_TYPE)
  ) {
    return true;
  }
  return false;
};

const stripSoftNav = (
  init: PerformanceObserverInit,
): PerformanceObserverInit | null => {
  if (init.type !== undefined) {
    return init.type === SOFT_NAVIGATION_ENTRY_TYPE ? null : init;
  }
  if (Array.isArray(init.entryTypes)) {
    const remaining = init.entryTypes.filter(
      (t) => t !== SOFT_NAVIGATION_ENTRY_TYPE,
    );
    if (remaining.length === 0) {
      return null;
    }
    return { ...init, entryTypes: remaining };
  }
  return init;
};

export const installSoftNavigationObserver = (
  options: SoftNavigationObserverOptions = {},
): (() => void) => {
  if (installed) {
    return noop;
  }
  if (isEntryTypeSupported(SOFT_NAVIGATION_ENTRY_TYPE)) {
    return noop;
  }
  if (
    typeof window === 'undefined' ||
    typeof PerformanceObserver === 'undefined'
  ) {
    return noop;
  }

  installed = true;

  const interactionTimeoutMs =
    options.interactionTimeoutMs ?? DEFAULT_INTERACTION_TIMEOUT_MS;
  const bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;

  const buffer: SoftNavigationEntry[] = [];
  const subscriptions = new Map<unknown, SoftNavSubscription>();

  const NativePerformanceObserver = window.PerformanceObserver;
  const nativeSupported: readonly string[] =
    NativePerformanceObserver.supportedEntryTypes ?? [];

  const buildList = (
    entries: SoftNavigationEntry[],
  ): PerformanceObserverEntryList => {
    const snapshot = entries.slice();
    return {
      getEntries: () => snapshot.slice(),
      getEntriesByType: (type: string) =>
        type === SOFT_NAVIGATION_ENTRY_TYPE ? snapshot.slice() : [],
      getEntriesByName: (name: string, type?: string) => {
        if (type !== undefined && type !== SOFT_NAVIGATION_ENTRY_TYPE) {
          return [];
        }
        return snapshot.filter((e) => e.name === name);
      },
    } as PerformanceObserverEntryList;
  };

  const flush = (sub: SoftNavSubscription): void => {
    if (!sub.active || sub.pending.length === 0) {
      return;
    }
    const batch = sub.pending.splice(0);
    try {
      sub.callback(buildList(batch), sub.observer);
    } catch {
      // swallow user-callback errors to match native behavior best-effort
    }
  };

  const enqueue = (entry: SoftNavigationEntry): void => {
    buffer.push(entry);
    while (buffer.length > bufferSize) {
      buffer.shift();
    }
    for (const sub of subscriptions.values()) {
      if (!sub.active) {
        continue;
      }
      sub.pending.push(entry);
      const target = sub;
      queueMicrotask(() => flush(target));
    }
  };

  let pending: { time: number; url: string } | null = null;
  let outerFrame: number | null = null;
  let innerFrame: number | null = null;
  let disposed = false;
  let lastUrl = window.location.href;

  const onInteraction = (event: Event): void => {
    pending = { time: event.timeStamp, url: window.location.href };
  };

  const onPotentialUrlChange = (): void => {
    const newUrl = window.location.href;
    if (newUrl === lastUrl) {
      return;
    }
    lastUrl = newUrl;

    if (!pending) {
      return;
    }

    const elapsed = performance.now() - pending.time;
    if (elapsed > interactionTimeoutMs) {
      pending = null;
      return;
    }

    const startTime = pending.time;
    pending = null;

    outerFrame = window.requestAnimationFrame(() => {
      outerFrame = null;
      if (disposed) {
        return;
      }
      innerFrame = window.requestAnimationFrame((paintTime) => {
        innerFrame = null;
        if (disposed) {
          return;
        }
        enqueue(
          new SoftNavigationEntry({
            name: newUrl,
            startTime,
            paintTime,
            navigationId: generateUUID(),
          }),
        );
      });
    });
  };

  window.addEventListener('pointerdown', onInteraction, true);
  window.addEventListener('keydown', onInteraction, true);

  const detectionCleanups: Array<() => void> = [];

  const nav = (window as Window & { navigation?: NavigationAPI }).navigation;
  const hasNavigationAPI =
    nav !== undefined && typeof nav.addEventListener === 'function';

  if (hasNavigationAPI && nav) {
    /* eslint-disable baseline-js/use-baseline -- Navigation API is used as progressive enhancement behind runtime feature detection */
    // The navigate event fires synchronously when pushState/replaceState is
    // called (and asynchronously for traversal). We bind the interaction
    // context here so the pending interaction reflects what was current at the
    // moment the navigation started, not when navigatesuccess fires later.
    const onNavigate = (event: NavigateEvent): void => {
      if (!event.destination.sameDocument) {
        return;
      }
      const newUrl = event.destination.url;
      if (newUrl === lastUrl) {
        return;
      }
      lastUrl = newUrl;
      if (!pending) {
        return;
      }
      const elapsed = performance.now() - pending.time;
      if (elapsed > interactionTimeoutMs) {
        pending = null;
        return;
      }
      const startTime = pending.time;
      pending = null;
      outerFrame = window.requestAnimationFrame(() => {
        outerFrame = null;
        if (disposed) {
          return;
        }
        innerFrame = window.requestAnimationFrame((paintTime) => {
          innerFrame = null;
          if (disposed) {
            return;
          }
          enqueue(
            new SoftNavigationEntry({
              name: newUrl,
              startTime,
              paintTime,
              navigationId: generateUUID(),
            }),
          );
        });
      });
    };
    nav.addEventListener('navigate', onNavigate);
    detectionCleanups.push(() => {
      nav.removeEventListener('navigate', onNavigate);
    });
    /* eslint-enable baseline-js/use-baseline */
  } else {
    // Wrap history.pushState/replaceState. We never unwrap on teardown — third
    // parties may wrap after us, and restoring the original would silently
    // remove their wrapping. Instead the wrapper calls a swappable handler we
    // set to noop on teardown.
    let onHistoryUrlChange: () => void = onPotentialUrlChange;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function patchedPushState(
      this: History,
      ...args: Parameters<History['pushState']>
    ): void {
      originalPushState.apply(this, args);
      onHistoryUrlChange();
    };

    history.replaceState = function patchedReplaceState(
      this: History,
      ...args: Parameters<History['replaceState']>
    ): void {
      originalReplaceState.apply(this, args);
      onHistoryUrlChange();
    };

    window.addEventListener('popstate', onPotentialUrlChange);
    window.addEventListener('hashchange', onPotentialUrlChange);

    detectionCleanups.push(() => {
      onHistoryUrlChange = () => {};
      window.removeEventListener('popstate', onPotentialUrlChange);
      window.removeEventListener('hashchange', onPotentialUrlChange);
    });
  }

  class PatchedPerformanceObserver extends NativePerformanceObserver {
    public constructor(callback: PerformanceObserverCallback) {
      super(function bridgeNativeEntries(
        this: PerformanceObserver,
        list,
        observer,
      ) {
        const sub = subscriptions.get(observer);
        callback(list, sub?.observer ?? observer);
      });
      subscriptions.set(this, {
        callback,
        observer: this,
        pending: [],
        bufferedReplayed: false,
        active: false,
      });
    }

    public override observe(init?: PerformanceObserverInit): void {
      const opts = init ?? {};
      const sub = subscriptions.get(this);
      if (sub && containsSoftNav(opts)) {
        sub.active = true;
        if (opts.buffered === true && !sub.bufferedReplayed) {
          sub.bufferedReplayed = true;
          sub.pending.push(...buffer);
          const target = sub;
          queueMicrotask(() => flush(target));
        }
        const remainder = stripSoftNav(opts);
        if (remainder !== null) {
          super.observe(remainder);
        }
        return;
      }
      super.observe(opts);
    }

    public override disconnect(): void {
      const sub = subscriptions.get(this);
      if (sub) {
        sub.active = false;
        sub.pending.length = 0;
        sub.bufferedReplayed = false;
      }
      super.disconnect();
    }

    public override takeRecords(): PerformanceEntry[] {
      const sub = subscriptions.get(this);
      const ours = sub ? sub.pending.splice(0) : [];
      return [...ours, ...super.takeRecords()];
    }

    public static override get supportedEntryTypes(): readonly string[] {
      if (nativeSupported.includes(SOFT_NAVIGATION_ENTRY_TYPE)) {
        return nativeSupported;
      }
      return [...nativeSupported, SOFT_NAVIGATION_ENTRY_TYPE];
    }
  }

  Reflect.set(window, 'PerformanceObserver', PatchedPerformanceObserver);

  const originalGetEntries = performance.getEntries;
  const originalGetEntriesByType = performance.getEntriesByType;
  const originalGetEntriesByName = performance.getEntriesByName;

  performance.getEntries = function patchedGetEntries(): PerformanceEntry[] {
    const native = originalGetEntries.call(this);
    if (buffer.length === 0) {
      return native;
    }
    const merged = native.concat(buffer);
    merged.sort((a, b) => a.startTime - b.startTime);
    return merged;
  };

  performance.getEntriesByType = function patchedGetEntriesByType(
    type: string,
  ): PerformanceEntry[] {
    if (type === SOFT_NAVIGATION_ENTRY_TYPE) {
      return buffer.slice();
    }
    return originalGetEntriesByType.call(this, type as never);
  };

  performance.getEntriesByName = function patchedGetEntriesByName(
    name: string,
    type?: string,
  ): PerformanceEntry[] {
    if (type === SOFT_NAVIGATION_ENTRY_TYPE) {
      return buffer.filter((e) => e.name === name);
    }
    if (type !== undefined) {
      return originalGetEntriesByName.call(this, name, type);
    }
    const native = originalGetEntriesByName.call(this, name);
    const ours = buffer.filter((e) => e.name === name);
    if (ours.length === 0) {
      return native;
    }
    const merged = native.concat(ours);
    merged.sort((a, b) => a.startTime - b.startTime);
    return merged;
  };

  return () => {
    installed = false;
    disposed = true;

    window.removeEventListener('pointerdown', onInteraction, true);
    window.removeEventListener('keydown', onInteraction, true);

    for (const cleanup of detectionCleanups) {
      cleanup();
    }

    if (outerFrame !== null) {
      window.cancelAnimationFrame(outerFrame);
      outerFrame = null;
    }
    if (innerFrame !== null) {
      window.cancelAnimationFrame(innerFrame);
      innerFrame = null;
    }
    pending = null;

    Reflect.set(window, 'PerformanceObserver', NativePerformanceObserver);
    performance.getEntries = originalGetEntries;
    performance.getEntriesByType = originalGetEntriesByType;
    performance.getEntriesByName = originalGetEntriesByName;

    subscriptions.clear();
    buffer.length = 0;
  };
};
