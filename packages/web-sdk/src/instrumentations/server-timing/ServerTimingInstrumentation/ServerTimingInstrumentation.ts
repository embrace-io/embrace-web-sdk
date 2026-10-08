import { SeverityNumber } from '@opentelemetry/api-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  KEY_EMB_SERVER_TIMING_DESCRIPTION,
  KEY_EMB_SERVER_TIMING_DURATION,
  KEY_EMB_SERVER_TIMING_NAME,
  SERVER_TIMING_EVENT_NAME,
} from './constants.ts';
import type { ServerTimingInstrumentationArgs } from './types.ts';

export class ServerTimingInstrumentation extends EmbraceInstrumentationBase {
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

  public override onEnable(): void {
    // The navigation entry is added to the performance entry buffer while the
    // document is created, before any script runs, and its serverTiming comes
    // from the response headers, so there is nothing to observe:
    // https://w3c.github.io/navigation-timing/#dfn-create-the-navigation-timing-entry
    this._readServerTiming();
  }

  public override onDisable(): void {
    // The one read happened at enable; there is nothing to undo.
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
