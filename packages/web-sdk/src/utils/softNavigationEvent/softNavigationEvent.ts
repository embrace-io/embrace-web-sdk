import { generateUUID } from '../generateUUID.ts';
import { isEntryTypeSupported } from '../performanceObserver/performanceObserver.ts';
import type { SoftNavigationDetail, SoftNavigationOptions } from './types.ts';
import { SOFT_NAVIGATION_EVENT } from './types.ts';

const DEFAULT_INTERACTION_TIMEOUT_MS = 500;
const SOFT_NAVIGATION_ENTRY_TYPE = 'soft-navigation';

interface PendingInitiator {
  time: number;
  url: string;
}

interface NativeSoftNavigationEntry extends PerformanceEntry {
  navigationId?: string;
  paintTime?: number;
  presentationTime?: number;
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

export const installSoftNavigationEvent = (
  options: SoftNavigationOptions = {},
): (() => void) => {
  if (installed) {
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

  let lastUrl = window.location.href;

  const dispatch = (detail: SoftNavigationDetail): void => {
    window.dispatchEvent(new CustomEvent(SOFT_NAVIGATION_EVENT, { detail }));
  };

  if (isEntryTypeSupported(SOFT_NAVIGATION_ENTRY_TYPE)) {
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as NativeSoftNavigationEntry[]) {
          const url = entry.name || window.location.href;
          const previousUrl = lastUrl;
          lastUrl = url;
          dispatch({
            url,
            previousUrl,
            startTime: entry.startTime,
            paintTime:
              entry.paintTime ?? entry.presentationTime ?? entry.startTime,
            navigationId: entry.navigationId ?? generateUUID(),
          });
        }
      });
      observer.observe({ type: SOFT_NAVIGATION_ENTRY_TYPE, buffered: true });
      return () => {
        installed = false;
        observer?.disconnect();
      };
    } catch {
      observer?.disconnect();
    }
  }

  let pending: PendingInitiator | null = null;
  let outerFrame: number | null = null;
  let innerFrame: number | null = null;
  let disposed = false;

  const onInteraction = (event: Event): void => {
    pending = {
      time: event.timeStamp,
      url: window.location.href,
    };
  };

  const onPotentialUrlChange = (): void => {
    const newUrl = window.location.href;
    if (newUrl === lastUrl) {
      return;
    }

    const previousUrl = lastUrl;
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
        dispatch({
          url: newUrl,
          previousUrl,
          startTime,
          paintTime,
          navigationId: generateUUID(),
        });
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
    // called (and asynchronously for traversal). We do all interaction binding
    // here so the pending interaction reflects what was current at the moment
    // the navigation started, not when navigatesuccess fires later.
    const onNavigate = (event: NavigateEvent): void => {
      if (!event.destination.sameDocument) {
        return;
      }
      const newUrl = event.destination.url;
      if (newUrl === lastUrl) {
        return;
      }
      const previousUrl = lastUrl;
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
          dispatch({
            url: newUrl,
            previousUrl,
            startTime,
            paintTime,
            navigationId: generateUUID(),
          });
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
  };
};
