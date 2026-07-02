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
  KEY_EMB_SOFT_NAVIGATION_START_TIME,
} from './constants.ts';
import type {
  PerformanceSoftNavigationTiming,
  SoftNavigationPerformanceInstrumentationArgs,
} from './types.ts';

export class SoftNavigationPerformanceInstrumentation extends EmbraceInstrumentationBase {
  private _observer: PerformanceObserver | null = null;

  public constructor({
    diag,
    perf,
    limitManager,
  }: SoftNavigationPerformanceInstrumentationArgs = {}) {
    super({
      instrumentationName: 'SoftNavigationPerformanceInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      limitManager,
      config: {},
    });

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override enable(): void {
    if (isEntryTypeSupported('soft-navigation')) {
      super.enable();
    } else {
      this._diag.debug('soft-navigation not supported, skipping');
    }
  }

  public override onEnable(): void {
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

  public onDisable(): void {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  private _processEntry(entry: PerformanceSoftNavigationTiming): void {
    if (!this._isEnabled) {
      return;
    }

    if (this.limitManager?.limitSoftNavigationEntry()) {
      return;
    }

    const span = this.tracer.startSpan(entry.name, {
      startTime: this.perf.epochMillisFromZeroTime(entry.startTime),
      attributes: {
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
}
