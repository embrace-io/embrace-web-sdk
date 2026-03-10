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
  private _entries: PerformanceLongAnimationFrameTimingEntry[] = [];
  private _isFirstEntry = true;
  private _removeSessionEndListener: (() => void) | null = null;
  private _isEnabled = false;

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
    this._flushReport();
    this._isEnabled = false;

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

    this._entries.push(entry);
  }

  private _flushReport(): void {
    if (this._entries.length === 0) {
      return;
    }

    const entries = this._entries;

    this._entries = [];
    const wasFirstEntry = this._isFirstEntry;
    this._isFirstEntry = false;

    const totalDuration = entries.reduce((sum, e) => sum + e.duration, 0);

    const workDuration = entries.reduce((sum, e) => {
      return sum + (e.renderStart ? e.renderStart - e.startTime : e.duration);
    }, 0);

    const styleLayoutDuration = entries.reduce((sum, e) => {
      if (!e.styleAndLayoutStart) {
        return sum;
      }
      return (
        sum + Math.max(0, e.startTime + e.duration - e.styleAndLayoutStart)
      );
    }, 0);

    const count = entries.length;

    const longestDuration = Math.max(...entries.map((e) => e.duration));

    const entriesAfterFirst = entries.slice(1);
    const longestDurationExcludingFirst =
      entriesAfterFirst.length > 0
        ? Math.max(...entriesAfterFirst.map((e) => e.duration))
        : 0;

    const entriesToSum = wasFirstEntry ? entries.slice(1) : entries;
    const totalBlockingDuration = entriesToSum
      .filter((e) => e.firstUIEventTimestamp === 0)
      .reduce((sum, e) => sum + e.blockingDuration, 0);

    let rating: string;
    if (totalBlockingDuration <= BLOCKING_DURATION_GOOD_THRESHOLD) {
      rating = 'good';
    } else if (totalBlockingDuration <= BLOCKING_DURATION_POOR_THRESHOLD) {
      rating = 'needs-improvement';
    } else {
      rating = 'poor';
    }

    const attrs: Record<string, string | number> = {
      [KEY_EMB_TYPE]: EMB_TYPES.LoAF,
      [ATTR_LOAF_TOTAL_DURATION]: totalDuration,
      [ATTR_LOAF_WORK_DURATION]: workDuration,
      [ATTR_LOAF_STYLE_AND_LAYOUT_DURATION]: styleLayoutDuration,
      [ATTR_LOAF_COUNT]: count,
      [ATTR_LOAF_LONGEST_DURATION]: longestDuration,
      [ATTR_LOAF_LONGEST_DURATION_EXCLUDING_FIRST]:
        longestDurationExcludingFirst,
      [ATTR_LOAF_TOTAL_BLOCKING_DURATION]: totalBlockingDuration,
      [ATTR_LOAF_RATING]: rating,
    };

    this.logger.emit({
      eventName: LOAF_EVENT_NAME,
      // timestamp: this.perf.getNowMillis(),
      severityNumber: SeverityNumber.INFO,
      // severityText: 'INFO',
      attributes: attrs,
    });
  }
}
