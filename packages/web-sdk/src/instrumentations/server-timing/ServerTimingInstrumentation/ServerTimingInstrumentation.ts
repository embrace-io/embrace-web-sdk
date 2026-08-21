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

  /*
   * Server timings arrive in the response headers, so they are on the
   * navigation entry before any script in the document runs: nothing has to be
   * waited for. The logs are recorded because enabling happens after
   * registerInstrumentations has attached the providers.
   *
   * The page's one read, so a disable and re-enable emits nothing further.
   */
  public override onEnable(): void {
    if (this._performanceCollected) {
      return;
    }
    this._performanceCollected = true;

    const navEntries = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];
    // WebKit gives about:blank, popups and srcdoc iframes no navigation entry.
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

  /* The read is spent while enabling, so nothing is left running to unwind. */
  public override onDisable(): void {}
}
