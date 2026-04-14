import { SeverityNumber } from '@opentelemetry/api-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.ts';
import { createPerformanceObserver } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  ATTR_USER_TIMING_DURATION,
  ATTR_USER_TIMING_ENTRY_TYPE,
  ATTR_USER_TIMING_NAME,
  ATTR_USER_TIMING_START_TIME,
  USER_TIMING_EVENT_NAME,
} from './constants.ts';
import type { UserTimingInstrumentationArgs } from './types.ts';

export class UserTimingInstrumentation extends EmbraceInstrumentationBase {
  private _markObserver: PerformanceObserver | null = null;
  private _measureObserver: PerformanceObserver | null = null;
  private _seenEntries: Set<string> = new Set();
  private _isEnabled = false;

  public constructor({
    diag,
    perf,
    limitManager,
  }: UserTimingInstrumentationArgs = {}) {
    super({
      instrumentationName: 'UserTimingInstrumentation',
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

  public enable(): void {
    if (this._isEnabled) {
      return;
    }

    this._isEnabled = true;
    this._seenEntries = new Set();

    if (this._markObserver) {
      this._markObserver.disconnect();
    }
    if (this._measureObserver) {
      this._measureObserver.disconnect();
    }

    this._markObserver = createPerformanceObserver<PerformanceMark>(
      'mark',
      (entry) => this._processEntry(entry),
      { diag: this._diag },
    );

    this._measureObserver = createPerformanceObserver<PerformanceMeasure>(
      'measure',
      (entry) => this._processEntry(entry),
      { diag: this._diag },
    );
  }

  public disable(): void {
    this._isEnabled = false;

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

    const attributes: Record<string, string | number> = {
      [KEY_EMB_TYPE]: EMB_TYPES.UserTiming,
      [ATTR_USER_TIMING_NAME]: entry.name,
      [ATTR_USER_TIMING_START_TIME]: this.perf.epochMillisFromOriginOffset(
        entry.startTime,
      ),
      [ATTR_USER_TIMING_DURATION]: entry.duration,
      [ATTR_USER_TIMING_ENTRY_TYPE]: entry.entryType,
    };

    const detail = (entry as PerformanceMark).detail;
    const body = detail != null ? JSON.stringify(detail) : undefined;

    this.logger.emit({
      eventName: USER_TIMING_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes,
      body,
    });
  }
}
