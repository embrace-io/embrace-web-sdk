import type { Attributes, Gauge } from '@opentelemetry/api';
import type { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import type { MetricWithAttribution } from 'web-vitals/attribution';
import { type Metric } from 'web-vitals/attribution';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.js';
import { withErrorFallback } from '../../../utils/index.js';
import {
  CORE_WEB_VITALS,
  EMB_WEB_VITALS_PREFIX,
  NOT_CORE_WEB_VITALS,
  WEB_VITALS_ID_TO_LISTENER
} from './constants.js';
import type {
  TrackingLevel,
  WebVitalListeners,
  WebVitalsInstrumentationArgs
} from './types.js';
import { EmbraceInstrumentationBase } from '../../session/index.js';

export class WebVitalsInstrumentation extends EmbraceInstrumentationBase {
  //map of web vitals to gauges to emit to
  private readonly _gauges: Partial<Record<Metric['name'], Gauge>>;
  private readonly _trackingLevel: TrackingLevel;
  private readonly _listeners: WebVitalListeners;

  // function that emits a metric for each web vital report
  public constructor({
    diag,
    perf,
    trackingLevel = 'core',
    listeners = WEB_VITALS_ID_TO_LISTENER
  }: WebVitalsInstrumentationArgs = {}) {
    super({
      instrumentationName: 'WebVitalsInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {}
    });
    this._gauges = {};
    this._trackingLevel = trackingLevel;
    this._listeners = listeners;

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override disable(): void {
    // do nothing.
  }

  public enable(): void {
    const meter = this.meter;
    CORE_WEB_VITALS.forEach(name => {
      this._gauges[name] = meter.createGauge(
        `${EMB_WEB_VITALS_PREFIX}-${name}`,
        {
          description: `Embrace instrumentation - emits a metric for each web vital report for ${name}`
        }
      );
    });
    if (this._trackingLevel === 'all') {
      NOT_CORE_WEB_VITALS.forEach(name => {
        this._gauges[name] = meter.createGauge(
          `${EMB_WEB_VITALS_PREFIX}-${name}`,
          {
            description: `Embrace instrumentation - emits a metric for each web vital report for ${name}`
          }
        );
      });
    }
    Object.keys(this._gauges).forEach(name => {
      this._listeners[name as Metric['name']]?.(metric => {
        // first thing record the time when this cb was invoked
        const now = this._getTimeForMetric(metric);

        // we split the atts into low cardinality and high cardinality so we only report the low cardinality ones as metrics
        // and keep the high cardinality ones for the span event representation
        const lowCardinalityAtts: Attributes = {
          [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
          'emb.web_vital.navigation_type': metric.navigationType,
          'emb.web_vital.name': metric.name,
          'emb.web_vital.rating': metric.rating
        };

        this._gauges[name as Metric['name']]?.record(
          metric.value,
          lowCardinalityAtts
        );
        const highCardinalityAtts: Attributes = {
          'emb.web_vital.id': metric.id,
          'emb.web_vital.delta': metric.delta,
          'emb.web_vital.value': metric.value,
          // Keeping this attribute for now since loaders are expecting it but the current URL is not necessarily tied
          // to the web vital, e.g. CLS is cumulative so the score may have actually been most heavily influenced by a
          // previous URL, look at attribution instead
          [ATTR_URL_FULL]: document.URL
        };

        Object.entries(metric.attribution).forEach(([key, value]) => {
          highCardinalityAtts[`emb.web_vital.attribution.${key}`] =
            typeof value === 'number'
              ? value
              : withErrorFallback(
                  JSON.stringify,
                  'Error: unable to serialize the value as JSON. Likely a js circular structure '
                )(value);
        });
        const currentSessionSpan = this.sessionManager.getSessionSpan();
        if (!currentSessionSpan) {
          return;
        }
        currentSessionSpan.addEvent(
          `${EMB_WEB_VITALS_PREFIX}-report-${name}`,
          {
            ...lowCardinalityAtts,
            ...highCardinalityAtts
          },
          now
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
