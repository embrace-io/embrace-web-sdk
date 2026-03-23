/* eslint-disable baseline-js/use-baseline */
import { SeverityNumber } from '@opentelemetry/api-logs';
import type { Metric } from 'web-vitals';
import type { SpanSessionManager } from '../../../api-sessions/index.ts';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  ATTR_TBD_LOAF_COUNT,
  ATTR_TBD_LOAF_LONGEST_DURATION,
  ATTR_TBD_LOAF_LONGEST_DURATION_EXCLUDING_FIRST,
  ATTR_TBD_LOAF_STYLE_AND_LAYOUT_DURATION,
  ATTR_TBD_LOAF_TOTAL_DURATION,
  ATTR_TBD_LOAF_WORK_DURATION,
  BLOCKING_DURATION_GOOD_THRESHOLD,
  BLOCKING_DURATION_POOR_THRESHOLD,
  LOAF_EVENT_NAME,
  LOAF_SCRIPTS_EVENT_NAME,
  MAX_SCRIPT_URL_LENGTH,
} from './constants.ts';
import type { LoafInstrumentationArgs } from './types.ts';

type ScriptSummaryValue = {
  totalDuration: number;
  styleAndLayoutDuration: number;
  count: number;
};

type ScriptSummaries = Map<string, ScriptSummaryValue>;

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
  private _scriptSummaries: ScriptSummaries = new Map();
  private _maxScriptEntries = 250;

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
        this._diag.debug('long-animation-frame not supported, skipping');
        return;
      }

      this._isEnabled = true;

      if (this._observer) {
        this._observer.disconnect();
      }

      this._observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          try {
            this._processEntry(entry as PerformanceLongAnimationFrameTiming);
          } catch (e) {
            this._diag.error('error processing entry', e);
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
      this._diag.error('failed to enable', e);
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
          this._diag.error('error flushing report', e);
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

  private _processEntry(entry: PerformanceLongAnimationFrameTiming): void {
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

    if (this._isFirstEntry && this._count === 1) {
      this._isFirstEntry = false;
    } else {
      this._longestDurationExcludingFirst = Math.max(
        this._longestDurationExcludingFirst,
        entry.duration,
      );
      if (entry.firstUIEventTimestamp === 0) {
        this._totalBlockingDuration += entry.blockingDuration;
      }
    }

    for (const script of entry.scripts) {
      const key =
        script.sourceURL?.substring(0, MAX_SCRIPT_URL_LENGTH) || '(inline)';
      const existing = this._scriptSummaries.get(key);
      if (existing) {
        existing.totalDuration += script.duration;
        existing.styleAndLayoutDuration += script.forcedStyleAndLayoutDuration;
        existing.count++;
      } else {
        this._scriptSummaries.set(key, {
          totalDuration: script.duration,
          styleAndLayoutDuration: script.forcedStyleAndLayoutDuration,
          count: 1,
        });
      }
    }
  }

  private _flushReport(): void {
    if (this._count === 0) {
      return;
    }

    // use web-vitals Metric type for rating
    let rating: Metric['rating'];
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
      [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
      ['emb.web_vital.name']: 'TBD',
      ['emb.web_vital.value']: Math.round(this._totalBlockingDuration),
      ['emb.web_vital.rating']: rating,
      [ATTR_TBD_LOAF_TOTAL_DURATION]: Math.round(this._totalDuration),
      [ATTR_TBD_LOAF_WORK_DURATION]: Math.round(this._workDuration),
      [ATTR_TBD_LOAF_STYLE_AND_LAYOUT_DURATION]: Math.round(
        this._styleLayoutDuration,
      ),
      [ATTR_TBD_LOAF_COUNT]: this._count,
      [ATTR_TBD_LOAF_LONGEST_DURATION]: Math.round(this._longestDuration),
      [ATTR_TBD_LOAF_LONGEST_DURATION_EXCLUDING_FIRST]: Math.round(
        this._longestDurationExcludingFirst,
      ),
    };

    try {
      this.logger.emit({
        eventName: LOAF_EVENT_NAME,
        severityNumber: SeverityNumber.INFO,
        attributes: attrs,
      });

      if (this._scriptSummaries.size > 0) {
        const scriptEntries = [...this._scriptSummaries]
          .sort((a, b) => b[1].totalDuration - a[1].totalDuration)
          .slice(0, this._maxScriptEntries)
          .map(([url, scriptEntry]) => [
            url,
            {
              total_duration: Math.round(scriptEntry.totalDuration),
              style_and_layout_duration: Math.round(
                scriptEntry.styleAndLayoutDuration,
              ),
              count: scriptEntry.count,
            },
          ]);

        this.logger.emit({
          eventName: LOAF_SCRIPTS_EVENT_NAME,
          severityNumber: SeverityNumber.INFO,
          body: JSON.stringify(Object.fromEntries(scriptEntries)),
          attributes: {
            [KEY_EMB_TYPE]: attrs[KEY_EMB_TYPE],
          },
        });
      }
    } catch (e) {
      this._diag.error('Error emitting LOAF event', e);
    } finally {
      this._resetAccumulators();
    }
  }

  private _resetAccumulators(): void {
    this._totalDuration = 0;
    this._workDuration = 0;
    this._styleLayoutDuration = 0;
    this._count = 0;
    this._longestDuration = 0;
    this._longestDurationExcludingFirst = 0;
    this._totalBlockingDuration = 0;
    this._scriptSummaries = new Map();
  }
}
