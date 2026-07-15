import { SeverityNumber } from '@opentelemetry/api-logs';
import { EMB_PERFORMANCE_INSTRUMENTATIONS } from '../../../constants/attributes.ts';
import {
  EMB_TYPES,
  KEY_EMB_INSTRUMENTATION,
  KEY_EMB_TYPE,
} from '../../../constants/index.ts';
import { createPerformanceObserver } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  KEY_EMB_USER_TIMING_DETAIL,
  KEY_EMB_USER_TIMING_DURATION,
  KEY_EMB_USER_TIMING_ENTRY_TYPE,
  KEY_EMB_USER_TIMING_NAME,
  KEY_EMB_USER_TIMING_START_TIME,
  USER_TIMING_EVENT_NAME,
} from './constants.ts';
import type {
  UserTimingEntryFilter,
  UserTimingInstrumentationArgs,
} from './types.ts';

export class UserTimingInstrumentation extends EmbraceInstrumentationBase {
  private _markObserver: PerformanceObserver | null = null;
  private _measureObserver: PerformanceObserver | null = null;
  private _seenEntries: Set<string> = new Set();
  private readonly _allowedEntries: UserTimingEntryFilter | undefined;

  public constructor({
    diag,
    perf,
    limitManager,
    allowedEntries,
  }: UserTimingInstrumentationArgs = {}) {
    super({
      instrumentationName: 'UserTimingInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      limitManager,
      config: {},
    });
    this._allowedEntries = allowedEntries;

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override onEnable(): void {
    this._seenEntries = new Set();

    if (this._markObserver) {
      this._markObserver.disconnect();
    }
    if (this._measureObserver) {
      this._measureObserver.disconnect();
    }

    this._markObserver = createPerformanceObserver<PerformanceMark>(
      'mark',
      this._processEntry.bind(this),
      { diag: this._diag },
    );

    if (!this._markObserver) {
      this._diag.error('failed to enable mark observer');
    }

    this._measureObserver = createPerformanceObserver<PerformanceMeasure>(
      'measure',
      (entry) => this._processEntry(entry),
      { diag: this._diag },
    );

    if (!this._measureObserver) {
      this._diag.error('failed to enable measure observer');
    }

    if (!this._markObserver && !this._measureObserver) {
      this._isEnabled = false;
    }
  }

  public onDisable(): void {
    if (this._markObserver) {
      this._markObserver.disconnect();
      this._markObserver = null;
    }

    if (this._measureObserver) {
      this._measureObserver.disconnect();
      this._measureObserver = null;
    }

    this._seenEntries = new Set();
  }

  private _processEntry(entry: PerformanceMark | PerformanceMeasure): void {
    if (!this._isEnabled) {
      return;
    }

    if (this._allowedEntries !== undefined) {
      const allowed = Array.isArray(this._allowedEntries)
        ? this._allowedEntries.includes(entry.name)
        : this._allowedEntries(entry);
      if (!allowed) {
        return;
      }
    }

    const key = `${location.href}::${entry.name}`;
    // De-duplicate entries by name and page URL, only processing the first occurrence of each unique name on each page URL
    if (this._seenEntries.has(key)) {
      return;
    }
    this._seenEntries.add(key);

    if (
      this.limitManager?.limitUserTimingEntry(
        entry.entryType as 'mark' | 'measure',
      )
    ) {
      return;
    }

    if (entry.entryType === 'measure') {
      const measureDetail = (entry as PerformanceMeasure).detail;
      const span = this.tracer.startSpan(entry.name, {
        startTime: this.perf.epochMillisFromOrigin(entry.startTime),
        attributes: {
          [KEY_EMB_TYPE]: EMB_TYPES.UserTiming,
          [KEY_EMB_INSTRUMENTATION]:
            EMB_PERFORMANCE_INSTRUMENTATIONS.UserTiming,
          [KEY_EMB_USER_TIMING_ENTRY_TYPE]: entry.entryType,
          [KEY_EMB_USER_TIMING_START_TIME]: this.perf.millisFromZeroTime(
            entry.startTime,
          ),
          [KEY_EMB_USER_TIMING_DURATION]: entry.duration,
          ...(measureDetail != null && {
            [KEY_EMB_USER_TIMING_DETAIL]: JSON.stringify(measureDetail),
          }),
        },
      });
      span.end(
        this.perf.epochMillisFromOrigin(entry.startTime + entry.duration),
      );
      return;
    }

    const detail = (entry as PerformanceMark).detail;
    const body = detail != null ? JSON.stringify(detail) : undefined;

    this.logger.emit({
      timestamp: this.perf.epochMillisFromOrigin(entry.startTime),
      eventName: USER_TIMING_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.UserTiming,
        [KEY_EMB_USER_TIMING_NAME]: entry.name,
        [KEY_EMB_USER_TIMING_START_TIME]: this.perf.millisFromZeroTime(
          entry.startTime,
        ),
        [KEY_EMB_USER_TIMING_DURATION]: entry.duration,
        [KEY_EMB_USER_TIMING_ENTRY_TYPE]: entry.entryType,
      },
      body,
    });
  }
}
