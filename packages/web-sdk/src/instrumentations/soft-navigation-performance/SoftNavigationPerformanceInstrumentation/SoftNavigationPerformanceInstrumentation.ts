/* eslint-disable baseline-js/use-baseline */
import type { NavigationHost } from '../../../common/index.ts';
import { KEY_BROWSER_URL_FULL } from '../../../constants/index.ts';
import {
  createPerformanceObserver,
  isEntryTypeSupported,
} from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  KEY_EMB_SOFT_NAVIGATION_DURATION,
  KEY_EMB_SOFT_NAVIGATION_INTERACTION_ID,
  KEY_EMB_SOFT_NAVIGATION_NAVIGATION_ID,
  KEY_EMB_SOFT_NAVIGATION_PAINT_TIME,
  KEY_EMB_SOFT_NAVIGATION_PRESENTATION_TIME,
  KEY_EMB_SOFT_NAVIGATION_SOURCE,
  KEY_EMB_SOFT_NAVIGATION_START_TIME,
  SOFT_NAVIGATION_SOURCES,
  SOFT_NAVIGATION_SPAN_NAME,
} from './constants.ts';
import type {
  PerformanceSoftNavigationTiming,
  SoftNavigationPerformanceInstrumentationArgs,
} from './types.ts';

/**
 * Returns the click entry whose processing window contains the given navigation
 * timestamp, or null if no match is found.
 *
 * For pushState navigations, currententrychange fires synchronously during the
 * click handler, so the timestamp falls within the click entry's
 * [startTime, startTime + duration] window.
 */
export function getNavigationEventTrigger(
  navigationTimestamp: number,
  clickEntries: PerformanceEventTiming[],
): PerformanceEventTiming | null {
  return (
    clickEntries.find(
      (entry) =>
        entry.startTime <= navigationTimestamp &&
        navigationTimestamp <= entry.startTime + entry.duration,
    ) ?? null
  );
}

type PendingNavigation = { timestamp: number; url: string };

export class SoftNavigationPerformanceInstrumentation extends EmbraceInstrumentationBase {
  private _observer: PerformanceObserver | null = null;
  private _eventObserver: PerformanceObserver | null = null;
  private _pendingNavigations: PendingNavigation[] = [];
  private _usePolyfill = false;
  private readonly _navigationHost: NavigationHost;

  private readonly _handleCurrentEntryChange = (): void => {
    const url = this._navigationHost.navigation?.currentEntry?.url ?? '';
    // Store origin-relative time (performance.now() equivalent) so it can be
    // compared directly against PerformanceEventTiming.startTime, which is also
    // origin-relative. getNowMillis() is epoch-based; subtracting getZeroTime()
    // converts it back to origin-relative.
    const timestamp = this.perf.getNowMillis() - this.perf.getZeroTime();
    this._pendingNavigations.push({ timestamp, url });
  };

  public constructor({
    diag,
    perf,
    limitManager,
    navigationHost = window as NavigationHost,
  }: SoftNavigationPerformanceInstrumentationArgs = {}) {
    super({
      instrumentationName: 'SoftNavigationPerformanceInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      limitManager,
      config: {},
    });

    this._navigationHost = navigationHost;

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override enable(): void {
    if (isEntryTypeSupported('soft-navigation')) {
      this._usePolyfill = false;
      super.enable();
    } else if (
      this._navigationHost.navigation != null &&
      isEntryTypeSupported('event')
    ) {
      this._usePolyfill = true;
      super.enable();
    }
  }

  public override onEnable(): void {
    if (this._usePolyfill) {
      this._enablePolyfill();
    } else {
      this._enableNative();
    }
  }

  private _enableNative(): void {
    if (this._observer) {
      this._observer.disconnect();
    }

    this._observer = createPerformanceObserver<PerformanceSoftNavigationTiming>(
      'soft-navigation',
      (entry) => this._processEntry(entry),
      { diag: this._diag },
    );

    if (!this._observer) {
      this._isEnabled = false;
      this._diag.error('failed to enable');
      return;
    }
  }

  private _enablePolyfill(): void {
    const nav = this._navigationHost.navigation;
    if (!nav) {
      return;
    }

    nav.addEventListener('currententrychange', this._handleCurrentEntryChange);

    this._eventObserver = createPerformanceObserver<PerformanceEventTiming>(
      'event',
      (entry) => this._processClickEntry(entry),
      // SPA routers commit navigations synchronously inside the click handler,
      // so the entry duration is well under the 104ms default threshold. 16ms
      // (one frame) is the spec minimum and captures any real interaction.
      { diag: this._diag, durationThreshold: 16 },
    );

    if (!this._eventObserver) {
      nav.removeEventListener(
        'currententrychange',
        this._handleCurrentEntryChange,
      );
      this._isEnabled = false;
      this._diag.error('failed to enable polyfill');
      return;
    }
  }

  public onDisable(): void {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    if (this._eventObserver) {
      this._eventObserver.disconnect();
      this._eventObserver = null;
    }

    this._navigationHost.navigation?.removeEventListener(
      'currententrychange',
      this._handleCurrentEntryChange,
    );
    this._pendingNavigations.length = 0;
  }

  private _processEntry(entry: PerformanceSoftNavigationTiming): void {
    if (!this._isEnabled) {
      return;
    }

    if (this.limitManager?.limitSoftNavigationEntry()) {
      return;
    }

    const span = this.tracer.startSpan(SOFT_NAVIGATION_SPAN_NAME, {
      startTime: this.perf.epochMillisFromZeroTime(entry.startTime),
      attributes: {
        [KEY_BROWSER_URL_FULL]: entry.name,
        [KEY_EMB_SOFT_NAVIGATION_SOURCE]:
          SOFT_NAVIGATION_SOURCES.performanceObserver,
        [KEY_EMB_SOFT_NAVIGATION_NAVIGATION_ID]: entry.navigationId,
        [KEY_EMB_SOFT_NAVIGATION_INTERACTION_ID]: entry.interactionId,
        [KEY_EMB_SOFT_NAVIGATION_START_TIME]: this.perf.millisFromZeroTime(
          entry.startTime,
        ),
        [KEY_EMB_SOFT_NAVIGATION_DURATION]: entry.duration,
        [KEY_EMB_SOFT_NAVIGATION_PAINT_TIME]:
          entry.paintTime != null
            ? this.perf.millisFromZeroTime(entry.paintTime)
            : undefined,
        [KEY_EMB_SOFT_NAVIGATION_PRESENTATION_TIME]:
          entry.presentationTime != null
            ? this.perf.millisFromZeroTime(entry.presentationTime)
            : undefined,
      },
    });
    span.end(
      this.perf.epochMillisFromZeroTime(entry.startTime + entry.duration),
    );
  }

  private _processClickEntry(entry: PerformanceEventTiming): void {
    if (!this._isEnabled) {
      return;
    }

    if (entry.name !== 'click') {
      return;
    }

    const index = this._pendingNavigations.findIndex(
      ({ timestamp }) => getNavigationEventTrigger(timestamp, [entry]) !== null,
    );

    if (index === -1) {
      return;
    }

    const [matched] = this._pendingNavigations.splice(index, 1);
    this._emitPolyfillSpan(entry, matched.timestamp, matched.url);
  }

  private _emitPolyfillSpan(
    clickEntry: PerformanceEventTiming,
    navigationTimestamp: number,
    url: string,
  ): void {
    if (this.limitManager?.limitSoftNavigationEntry()) {
      return;
    }

    const span = this.tracer.startSpan(SOFT_NAVIGATION_SPAN_NAME, {
      startTime: this.perf.epochMillisFromZeroTime(clickEntry.startTime),
      attributes: {
        [KEY_BROWSER_URL_FULL]: url,
        [KEY_EMB_SOFT_NAVIGATION_SOURCE]: SOFT_NAVIGATION_SOURCES.polyfill,
        [KEY_EMB_SOFT_NAVIGATION_START_TIME]: this.perf.millisFromZeroTime(
          clickEntry.startTime,
        ),
        [KEY_EMB_SOFT_NAVIGATION_DURATION]:
          navigationTimestamp - clickEntry.startTime,
        [KEY_EMB_SOFT_NAVIGATION_INTERACTION_ID]:
          clickEntry.interactionId !== 0 ? clickEntry.interactionId : undefined,
      },
    });
    span.end(this.perf.epochMillisFromZeroTime(navigationTimestamp));
  }
}
