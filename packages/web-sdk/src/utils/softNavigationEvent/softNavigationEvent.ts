import { diag } from '@opentelemetry/api';
import { generateUUID } from '../generateUUID.ts';
import { isEntryTypeSupported } from '../performanceObserver/performanceObserver.ts';
import type {
  SoftNavigationDetail,
  SoftNavigationOptions,
  SoftNavigationSource,
} from './types.ts';
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
    options?: AddEventListenerOptions | boolean,
  ): void;
  addEventListener(
    type: 'navigatesuccess',
    listener: () => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  addEventListener(
    type: 'navigateerror',
    listener: () => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: 'navigate',
    listener: (event: NavigateEvent) => void,
    options?: EventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: 'navigatesuccess',
    listener: () => void,
    options?: EventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: 'navigateerror',
    listener: () => void,
    options?: EventListenerOptions | boolean,
  ): void;
}

type HistoryStateMethod = History['pushState'] | History['replaceState'];

interface PatchedHistoryMethod {
  __embraceSoftNavOriginal?: HistoryStateMethod;
  __embraceSoftNavHandler?: () => void;
}

let installed = false;
const noop = (): void => {};
const diagLogger = diag.createComponentLogger({ namespace: 'soft-navigation' });

class SoftNavigationDetector {
  private readonly _interactionTimeoutMs: number;

  private _running = false;
  private _lastUrl = '';
  private _pending: PendingInitiator | null = null;
  private _outerFrame: number | null = null;
  private _innerFrame: number | null = null;
  private _observer: PerformanceObserver | null = null;
  private _detectionCleanups: Array<() => void> = [];
  private _onInteraction: ((event: Event) => void) | null = null;

  public constructor(interactionTimeoutMs: number) {
    this._interactionTimeoutMs = interactionTimeoutMs;
  }

  public start(): void {
    this._running = true;
    this._lastUrl = window.location.href;
    if (this._tryStartNativeObserver()) {
      return;
    }
    this._startFallback();
  }

  public stop(): void {
    if (!this._running) {
      return;
    }
    this._running = false;

    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    if (this._onInteraction) {
      window.removeEventListener('pointerdown', this._onInteraction, true);
      window.removeEventListener('keydown', this._onInteraction, true);
    }
    this._onInteraction = null;

    for (const cleanup of this._detectionCleanups) {
      cleanup();
    }
    this._detectionCleanups = [];

    if (this._outerFrame !== null) {
      window.cancelAnimationFrame(this._outerFrame);
      this._outerFrame = null;
    }
    if (this._innerFrame !== null) {
      window.cancelAnimationFrame(this._innerFrame);
      this._innerFrame = null;
    }
    this._pending = null;
  }

  private _dispatch(detail: SoftNavigationDetail): void {
    window.dispatchEvent(new CustomEvent(SOFT_NAVIGATION_EVENT, { detail }));
  }

  // Returns true when the native Soft Navigations API observer is installed
  // successfully. Returns false (without consuming installation state) when
  // the entry type is not supported or `observe()` throws, so the caller can
  // fall through to the SDK-side detection paths.
  private _tryStartNativeObserver(): boolean {
    if (!isEntryTypeSupported(SOFT_NAVIGATION_ENTRY_TYPE)) {
      return false;
    }
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as NativeSoftNavigationEntry[]) {
          const url = entry.name !== '' ? entry.name : window.location.href;
          const previousUrl = this._lastUrl;
          this._lastUrl = url;
          this._dispatch({
            source: 'soft-navigation-entry',
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
      this._observer = observer;
      return true;
    } catch (e) {
      observer?.disconnect();
      diagLogger.debug(
        `soft-navigation PerformanceObserver unavailable, falling back: ${e instanceof Error ? e.message : 'unknown error'}`,
      );
      return false;
    }
  }

  private _startFallback(): void {
    const onInteraction = (event: Event): void => {
      this._pending = {
        time: event.timeStamp,
        url: window.location.href,
      };
    };
    this._onInteraction = onInteraction;
    window.addEventListener('pointerdown', onInteraction, true);
    window.addEventListener('keydown', onInteraction, true);

    const nav = (window as Window & { navigation?: NavigationAPI }).navigation;
    const hasNavigationAPI =
      nav !== undefined && typeof nav.addEventListener === 'function';

    if (hasNavigationAPI && nav) {
      this._startNavigationApi(nav);
    } else {
      this._startHistoryFallback();
    }
  }

  private _startNavigationApi(nav: NavigationAPI): void {
    /* eslint-disable baseline-js/use-baseline -- Navigation API is used as progressive enhancement behind runtime feature detection */
    // The navigate event fires synchronously when pushState/replaceState is
    // called (and asynchronously for traversal). Interaction listeners are
    // bound unconditionally so the pending interaction reflects what was
    // current at the moment navigation started, not when navigatesuccess
    // fires later.
    const onNavigate = (event: NavigateEvent): void => {
      if (!event.destination.sameDocument) {
        return;
      }
      this._handleUrlChange('navigation-api', event.destination.url);
    };
    nav.addEventListener('navigate', onNavigate);
    this._detectionCleanups.push(() => {
      nav.removeEventListener('navigate', onNavigate);
    });
    /* eslint-enable baseline-js/use-baseline */
  }

  private _startHistoryFallback(): void {
    const onPotentialUrlChange = (): void => {
      this._handleUrlChange('history', window.location.href);
    };

    // Wrap history.pushState/replaceState. We never unwrap on teardown:
    // third parties may wrap after us, and restoring the original would
    // silently remove their wrapping. Instead the wrapper calls a swappable
    // handler we set to noop on teardown, and we tag the patched function so
    // a subsequent start() reuses the existing wrapper instead of chaining.
    try {
      this._wrapHistoryMethod('pushState', onPotentialUrlChange);
      this._wrapHistoryMethod('replaceState', onPotentialUrlChange);
    } catch (e) {
      diagLogger.warn(
        `unable to wrap history.pushState/replaceState, soft navigations via history will not be detected: ${e instanceof Error ? e.message : 'unknown error'}`,
      );
    }

    window.addEventListener('popstate', onPotentialUrlChange);
    window.addEventListener('hashchange', onPotentialUrlChange);
    this._detectionCleanups.push(() => {
      window.removeEventListener('popstate', onPotentialUrlChange);
      window.removeEventListener('hashchange', onPotentialUrlChange);
    });
  }

  private _wrapHistoryMethod(
    name: 'pushState' | 'replaceState',
    handler: () => void,
  ): void {
    const current = history[name] as HistoryStateMethod & PatchedHistoryMethod;
    if (current.__embraceSoftNavOriginal !== undefined) {
      // Already wrapped by a previous start(); reuse it by swapping the
      // handler reference rather than installing a second layer of patching.
      current.__embraceSoftNavHandler = handler;
      this._detectionCleanups.push(() => {
        current.__embraceSoftNavHandler = () => {};
      });
      return;
    }
    const original = current;
    const wrapper = function patchedHistoryMethod(
      this: History,
      ...args: Parameters<HistoryStateMethod>
    ): void {
      original.apply(this, args);
      wrapper.__embraceSoftNavHandler?.();
    } as HistoryStateMethod & PatchedHistoryMethod;
    wrapper.__embraceSoftNavOriginal = original;
    wrapper.__embraceSoftNavHandler = handler;
    history[name] = wrapper;
    this._detectionCleanups.push(() => {
      wrapper.__embraceSoftNavHandler = () => {};
    });
  }

  private _handleUrlChange(source: SoftNavigationSource, newUrl: string): void {
    if (newUrl === this._lastUrl) {
      return;
    }
    const previousUrl = this._lastUrl;
    this._lastUrl = newUrl;

    if (!this._pending) {
      return;
    }

    const elapsed = performance.now() - this._pending.time;
    if (elapsed > this._interactionTimeoutMs) {
      this._pending = null;
      return;
    }

    const startTime = this._pending.time;
    this._pending = null;
    this._scheduleDispatch(source, newUrl, previousUrl, startTime);
  }

  private _scheduleDispatch(
    source: SoftNavigationSource,
    url: string,
    previousUrl: string,
    startTime: number,
  ): void {
    this._outerFrame = window.requestAnimationFrame(() => {
      this._outerFrame = null;
      if (!this._running) {
        return;
      }
      this._innerFrame = window.requestAnimationFrame((paintTime) => {
        this._innerFrame = null;
        if (!this._running) {
          return;
        }
        this._dispatch({
          source,
          url,
          previousUrl,
          startTime,
          paintTime,
          navigationId: generateUUID(),
        });
      });
    });
  }
}

export const installSoftNavigationEvent = (
  options: SoftNavigationOptions = {},
): (() => void) => {
  if (installed) {
    diagLogger.debug(
      'installSoftNavigationEvent called while already installed, ignoring',
    );
    return noop;
  }
  if (
    typeof window === 'undefined' ||
    typeof PerformanceObserver === 'undefined'
  ) {
    return noop;
  }
  installed = true;

  const detector = new SoftNavigationDetector(
    options.interactionTimeoutMs ?? DEFAULT_INTERACTION_TIMEOUT_MS,
  );
  detector.start();

  return () => {
    installed = false;
    detector.stop();
  };
};
