import type { Attributes } from '@opentelemetry/api';
import type { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import type { MetricWithAttribution } from 'web-vitals/attribution';
import { type Metric } from 'web-vitals/attribution';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.js';
import { withErrorFallback } from '../../../utils/index.js';
import {
  ALL_WEB_VITALS,
  CORE_WEB_VITALS,
  EMB_WEB_VITALS_PREFIX,
  WEB_VITALS_ID_TO_LISTENER,
} from './constants.js';
import type {
  WebVitalListeners,
  WebVitalsInstrumentationArgs,
} from './types.js';
import { EmbraceInstrumentationBase } from '../../session/index.js';

export class WebVitalsInstrumentation extends EmbraceInstrumentationBase {
  //map of web vitals to gauges to emit to
  private readonly _metricsToTrack: Metric['name'][];
  private readonly _listeners: WebVitalListeners;

  // function that emits a metric for each web vital report
  public constructor({
    diag,
    perf,
    trackingLevel = 'core',
    listeners = WEB_VITALS_ID_TO_LISTENER,
  }: WebVitalsInstrumentationArgs = {}) {
    super({
      instrumentationName: 'WebVitalsInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });
    this._listeners = listeners;
    this._metricsToTrack =
      trackingLevel === 'core' ? [...CORE_WEB_VITALS] : [...ALL_WEB_VITALS];

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override disable(): void {
    // do nothing.
  }

  public enable(): void {
    this._metricsToTrack.forEach(name => {
      this._listeners[name]?.(metric => {
        const currentSessionSpan = this.sessionManager.getSessionSpan();

        if (!currentSessionSpan) {
          return;
        }

        // first thing record the time when this cb was invoked
        const metricTime = this._getTimeForMetric(metric);

        const attrs: Attributes = {
          [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
          'emb.web_vital.navigation_type': metric.navigationType,
          'emb.web_vital.name': metric.name,
          'emb.web_vital.rating': metric.rating,
          'emb.web_vital.id': metric.id,
          'emb.web_vital.delta': metric.delta,
          'emb.web_vital.value': metric.value,
        };

        Object.entries(metric.attribution).forEach(([key, value]) => {
          attrs[`emb.web_vital.attribution.${key}`] =
            typeof value === 'number'
              ? value
              : withErrorFallback(
                  JSON.stringify,
                  'Error: unable to serialize the value as JSON. Likely a js circular structure '
                )(value);
        });

        currentSessionSpan.addEvent(
          `${EMB_WEB_VITALS_PREFIX}-report-${name}`,
          attrs,
          metricTime
        );
      });
    });
  }

  private _getTimeForMetric(metric: MetricWithAttribution): number {
    if (metric.name === 'CLS' && metric.attribution.largestShiftTime) {
      return this.perf.epochMillisFromOriginOffset(
        metric.attribution.largestShiftTime
      );
    }

    if (metric.name === 'INP' && metric.attribution.interactionTime) {
      return this.perf.epochMillisFromOriginOffset(
        metric.attribution.interactionTime
      );
    }

    return this.perf.getNowMillis();
  }

  // no-op
  protected override init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    // NOTE: disabling typescript check, as this class was copied from OTel repo.
    // TBH, I agree with typescript here, but keeping it disabled for consistency with the base repo
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    | void {
    return;
  }
}
