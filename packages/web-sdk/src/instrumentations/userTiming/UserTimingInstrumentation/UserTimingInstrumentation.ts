import { SeverityNumber } from '@opentelemetry/api-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.ts';
import {
  createPerformanceObserver,
  isEntryTypeSupported,
} from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  ATTR_USER_TIMING_DURATION,
  ATTR_USER_TIMING_ENTRY_TYPE,
  ATTR_USER_TIMING_NAME,
  ATTR_USER_TIMING_START_TIME,
  MARK_CAP,
  MEASURE_CAP,
  USER_TIMING_EVENT_NAME,
} from './constants.ts';
import type { UserTimingInstrumentationArgs } from './types.ts';

export class UserTimingInstrumentation extends EmbraceInstrumentationBase {
  private _markObserver: PerformanceObserver | null = null;
  private _measureObserver: PerformanceObserver | null = null;
  private _seenEntries: Set<string> = new Set();
  private _markCount = 0;
  private _measureCount = 0;
  private _isEnabled = false;

  public constructor({ diag, perf }: UserTimingInstrumentationArgs = {}) {
    super({
      instrumentationName: 'UserTimingInstrumentation',
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

    if (!isEntryTypeSupported('mark')) {
      this._diag.debug('mark/measure not supported, skipping');
      return;
    }

    this._isEnabled = true;
    this._seenEntries = new Set();
    this._markCount = 0;
    this._measureCount = 0;

    if (this._markObserver) {
      this._markObserver.disconnect();
    }
    if (this._measureObserver) {
      this._measureObserver.disconnect();
    }

    this._markObserver = createPerformanceObserver<PerformanceMark>(
      'mark',
      (entries) => {
        for (const entry of entries) {
          try {
            this._processEntry(entry);
          } catch (e) {
            this._diag.error('error processing mark entry', e);
          }
        }
      },
    );

    this._measureObserver = createPerformanceObserver<PerformanceMeasure>(
      'measure',
      (entries) => {
        for (const entry of entries) {
          try {
            this._processEntry(entry);
          } catch (e) {
            this._diag.error('error processing measure entry', e);
          }
        }
      },
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
    this._markCount = 0;
    this._measureCount = 0;
  }

  private _processEntry(entry: PerformanceMark | PerformanceMeasure): void {
    if (!this._isEnabled) {
      return;
    }

    const key = `${location.href}::${entry.name}`;
    if (this._seenEntries.has(key)) {
      return;
    }
    this._seenEntries.add(key);

    if (entry.entryType === 'mark') {
      if (this._markCount >= MARK_CAP) {
        return;
      }
      this._markCount++;
    } else {
      if (this._measureCount >= MEASURE_CAP) {
        return;
      }
      this._measureCount++;
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
      ...(body !== undefined ? { body } : {}),
      eventName: USER_TIMING_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes,
    });
  }
}
