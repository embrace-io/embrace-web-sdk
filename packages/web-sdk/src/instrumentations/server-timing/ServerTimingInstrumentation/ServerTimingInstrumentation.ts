import { SeverityNumber } from '@opentelemetry/api-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.ts';
import { createPerformanceObserver } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  KEY_EMB_SERVER_TIMING_DESCRIPTION,
  KEY_EMB_SERVER_TIMING_DURATION,
  KEY_EMB_SERVER_TIMING_NAME,
  SERVER_TIMING_EVENT_NAME,
} from './constants.ts';
import type { ServerTimingInstrumentationArgs } from './types.ts';

export class ServerTimingInstrumentation extends EmbraceInstrumentationBase {
  private _navigationObserver: PerformanceObserver | null = null;
  private _performanceCollected = false;

  public constructor({
    diag,
    perf,
    limitManager,
  }: ServerTimingInstrumentationArgs = {}) {
    super({
      instrumentationName: 'ServerTimingInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      limitManager,
      config: {},
    });
  }

  private _disconnectObserver(): void {
    this._navigationObserver?.disconnect();
    this._navigationObserver = null;
  }

  public override onEnable(): void {
    if (this._performanceCollected) {
      return;
    }

    /*
     * The observer keeps the read out of the constructor. Under
     * registerGlobally: false the logger provider arrives later in this same
     * task, and a log emitted before it is lost for good because the
     * collection guard latches.
     *
     * buffered stays at its default of true, the opposite of the navigation
     * observer in DocumentLoadInstrumentation: server timings arrive in the
     * response headers and are complete on the entry from the start, so a
     * replay carries everything. It is also required, because the SDK usually
     * starts after the entry was buffered and an unbuffered subscription would
     * never be notified.
     */
    this._navigationObserver =
      createPerformanceObserver<PerformanceNavigationTiming>(
        'navigation',
        () => {
          this._disconnectObserver();
          this._readServerTiming();
        },
        { diag: this._diag },
      );

    if (!this._navigationObserver) {
      this._diag.warn(
        'navigation entries are not observable, server timings will not be collected',
      );
    }
  }

  public override onDisable(): void {
    this._disconnectObserver();
  }

  private _readServerTiming(): void {
    if (this._performanceCollected) {
      return;
    }
    this._performanceCollected = true;

    const navEntries = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];
    const serverTimingEntries = navEntries[0]?.serverTiming ?? [];

    for (const entry of serverTimingEntries) {
      if (this.limitManager?.limitServerTimingEntry()) {
        return;
      }

      this.logger.emit({
        eventName: SERVER_TIMING_EVENT_NAME,
        severityNumber: SeverityNumber.INFO,
        attributes: {
          [KEY_EMB_TYPE]: EMB_TYPES.ServerTiming,
          [KEY_EMB_SERVER_TIMING_NAME]: entry.name,
          [KEY_EMB_SERVER_TIMING_DURATION]: entry.duration,
          [KEY_EMB_SERVER_TIMING_DESCRIPTION]: entry.description,
        },
      });
    }
  }
}
