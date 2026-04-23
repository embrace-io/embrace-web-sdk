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
  private readonly _onLoad: () => void;
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

    this._onLoad = () => {
      this._readServerTiming();
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  public enable(): void {
    window.removeEventListener('load', this._onLoad);

    if (window.document.readyState === 'complete') {
      this._readServerTiming();
      return;
    }

    window.addEventListener('load', this._onLoad);
  }

  public disable(): void {
    window.removeEventListener('load', this._onLoad);
  }

  private _readServerTiming(): void {
    if (this._performanceCollected) {
      return;
    }
    this._performanceCollected = true;

    const navEntries = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];
    const serverTiming = navEntries[0]?.serverTiming;

    if (!serverTiming?.length) {
      return;
    }

    for (const entry of serverTiming) {
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
