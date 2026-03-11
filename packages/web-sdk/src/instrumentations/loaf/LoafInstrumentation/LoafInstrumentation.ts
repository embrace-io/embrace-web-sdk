import { SeverityNumber } from '@opentelemetry/api-logs';
import type { SpanSessionManager } from '../../../api-sessions/index.ts';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  ATTR_LOAF_COUNT,
  ATTR_LOAF_LONGEST_DURATION,
  ATTR_LOAF_LONGEST_DURATION_EXCLUDING_FIRST,
  ATTR_LOAF_RATING,
  ATTR_LOAF_STYLE_AND_LAYOUT_DURATION,
  ATTR_LOAF_TOTAL_BLOCKING_DURATION,
  ATTR_LOAF_TOTAL_DURATION,
  ATTR_LOAF_WORK_DURATION,
  BLOCKING_DURATION_GOOD_THRESHOLD,
  BLOCKING_DURATION_POOR_THRESHOLD,
  LOAF_EVENT_NAME,
} from './constants.ts';
import type {
  LoafInstrumentationArgs,
  PerformanceLongAnimationFrameTimingEntry,
} from './types.ts';

export class LoafInstrumentation extends EmbraceInstrumentationBase {
  private _observer: PerformanceObserver | null = null;
  private _isFirstEntry = true;
  private _removeSessionEndListener: (() => void) | null = null;
  private _isEnabled = false;

  private _totalDuration = 0;
  private _workDuration = 0;
  private _styleLayoutDuration = 0;
  private _count = 0;
  private _longestDuration = 0;
  private _longestDurationExcludingFirst = 0;
  private _totalBlockingDuration = 0;

  public constructor({ diag, perf }: LoafInstrumentationArgs = {}) {
    super({
      instrumentationName: 'LoafInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    if (this._config.enabled) {
      this.enable();
    }
  }

  public enable(): void {
    if (this._isEnabled) {
      return;
    }

    try {
      if (
        typeof PerformanceObserver === 'undefined' ||
        !PerformanceObserver.supportedEntryTypes?.includes(
          'long-animation-frame',
        )
      ) {
        this._diag.debug(
          'LoafInstrumentation: long-animation-frame not supported, skipping',
        );
        return;
      }

      this._isEnabled = true;

      if (this._observer) {
        this._observer.disconnect();
      }

      this._observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          try {
            this._processEntry(
              entry as PerformanceLongAnimationFrameTimingEntry,
            );
          } catch (e) {
            this._diag.error('LoafInstrumentation: error processing entry', e);
          }
        }
      });

      this._observer.observe({
        type: 'long-animation-frame',
        buffered: true,
      });

      this._registerSessionEndListener();
    } catch (e) {
      this._isEnabled = false;
      this._diag.error('LoafInstrumentation: failed to enable', e);
    }
  }

  private _registerSessionEndListener(): void {
    if (!this._isEnabled) {
      return;
    }

    if (this._removeSessionEndListener) {
      this._removeSessionEndListener();
    }

    this._removeSessionEndListener =
      this.sessionManager.addSessionEndedListener(() => {
        try {
          this._flushReport();
        } catch (e) {
          this._diag.error('LoafInstrumentation: error flushing report', e);
        }
      });
  }

  public override setSessionManager(sessionManager: SpanSessionManager): void {
    super.setSessionManager(sessionManager);
    this._registerSessionEndListener();
  }

  public disable(): void {
    this._isEnabled = false;
    this._resetAccumulators();

    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    if (this._removeSessionEndListener) {
      this._removeSessionEndListener();
      this._removeSessionEndListener = null;
    }
  }

  private _processEntry(entry: PerformanceLongAnimationFrameTimingEntry): void {
    if (!this._isEnabled) {
      return;
    }

    this._count++;
    this._totalDuration += entry.duration;
    this._workDuration += entry.renderStart
      ? entry.renderStart - entry.startTime
      : entry.duration;

    if (entry.styleAndLayoutStart) {
      this._styleLayoutDuration += Math.max(
        0,
        entry.startTime + entry.duration - entry.styleAndLayoutStart,
      );
    }

    this._longestDuration = Math.max(this._longestDuration, entry.duration);

    this._totalBlockingDuration += entry.blockingDuration;

    if (this._isFirstEntry && this._count === 1) {
      this._isFirstEntry = false;
    } else {
      this._longestDurationExcludingFirst = Math.max(
        this._longestDurationExcludingFirst,
        entry.duration,
      );
    }
  }

  private _flushReport(): void {
    if (this._count === 0) {
      return;
    }

    let rating: 'good' | 'needs-improvement' | 'poor';
    if (this._totalBlockingDuration <= BLOCKING_DURATION_GOOD_THRESHOLD) {
      rating = 'good';
    } else if (
      this._totalBlockingDuration <= BLOCKING_DURATION_POOR_THRESHOLD
    ) {
      rating = 'needs-improvement';
    } else {
      rating = 'poor';
    }

    const attrs: Record<string, string | number> = {
      [KEY_EMB_TYPE]: EMB_TYPES.LoAF,
      [ATTR_LOAF_TOTAL_DURATION]: this._totalDuration,
      [ATTR_LOAF_WORK_DURATION]: this._workDuration,
      [ATTR_LOAF_STYLE_AND_LAYOUT_DURATION]: this._styleLayoutDuration,
      [ATTR_LOAF_COUNT]: this._count,
      [ATTR_LOAF_LONGEST_DURATION]: this._longestDuration,
      [ATTR_LOAF_LONGEST_DURATION_EXCLUDING_FIRST]:
        this._longestDurationExcludingFirst,
      [ATTR_LOAF_TOTAL_BLOCKING_DURATION]: this._totalBlockingDuration,
      [ATTR_LOAF_RATING]: rating,
    };

    this.logger.emit({
      eventName: LOAF_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes: attrs,
    });

    this._resetAccumulators();
  }

  private _resetAccumulators(): void {
    this._totalDuration = 0;
    this._workDuration = 0;
    this._styleLayoutDuration = 0;
    this._count = 0;
    this._longestDuration = 0;
    this._longestDurationExcludingFirst = 0;
    this._totalBlockingDuration = 0;
  }
}
