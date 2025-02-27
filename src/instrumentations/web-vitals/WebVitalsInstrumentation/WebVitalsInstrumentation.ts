import { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import { Attributes, Gauge, MeterProvider } from '@opentelemetry/api';
import { type Metric } from 'web-vitals/attribution';
import { SpanSessionManager } from '../../../api-sessions/index.js';
import {
  CORE_WEB_VITALS,
  EMB_WEB_VITALS_PREFIX,
  METER_NAME,
  NOT_CORE_WEB_VITALS,
  WEB_VITALS_ID_TO_LISTENER,
} from './constants.js';
import { TrackingLevel, WebVitalsInstrumentationArgs } from './types.js';
import { withErrorFallback } from '../../../utils/index.js';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.js';
import { getNowMilis } from '../../../utils/getNowHRTime/getNowHRTime.js';

export class WebVitalsInstrumentation extends InstrumentationBase {
  //map of web vitals to gauges to emit to
  private readonly _gauges: Partial<Record<Metric['name'], Gauge>>;
  private readonly _trackingLevel: TrackingLevel;
  private readonly _spanSessionManager: SpanSessionManager;
  private readonly _meterProvider: MeterProvider;

  // function that emits a metric for each web vital report
  constructor({
    trackingLevel = 'core',
    spanSessionManager,
    meterProvider,
  }: WebVitalsInstrumentationArgs) {
    super('WebVitalsInstrumentation', '1.0.0', {});
    this._gauges = {};
    this._spanSessionManager = spanSessionManager;
    this._meterProvider = meterProvider;
    this._trackingLevel = trackingLevel;

    if (this._config.enabled) {
      this.enable();
    }
  }

  enable(): void {
    const meter = this._meterProvider.getMeter(METER_NAME);
    CORE_WEB_VITALS.forEach(name => {
      this._gauges[name] = meter.createGauge(
        `${EMB_WEB_VITALS_PREFIX}-${name}`,
        {
          description: `Embrace instrumentation - emits a metric for each web vital report for ${name}`,
        }
      );
    });
    if (this._trackingLevel === 'all') {
      NOT_CORE_WEB_VITALS.forEach(name => {
        this._gauges[name] = meter.createGauge(
          `${EMB_WEB_VITALS_PREFIX}-${name}`,
          {
            description: `Embrace instrumentation - emits a metric for each web vital report for ${name}`,
          }
        );
      });
    }
    Object.keys(this._gauges).forEach(name => {
      WEB_VITALS_ID_TO_LISTENER[name as Metric['name']](metric => {
        // first thing record the time when this cb was invoked
        const now = getNowMilis();
        // we split the atts into low cardinality and high cardinality so we only report the low cardinality ones as metrics
        // and keep the high cardinality ones for the span event representation
        const lowCardinalityAtts: Attributes = {
          [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
          'emb.web_vital.navigation_type': metric.navigationType,
          'emb.web_vital.name': metric.name,
          'emb.web_vital.rating': metric.rating,
        };

        this._gauges[name as Metric['name']]?.record(
          metric.value,
          lowCardinalityAtts
        );
        const highCardinalityAtts: Attributes = {
          'emb.web_vital.id': metric.id,
          'emb.web_vital.entries': JSON.stringify(metric.entries),
          'emb.web_vital.delta': metric.delta,
          'emb.web_vital.value': metric.value,
          [ATTR_URL_FULL]: document.URL,
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
        const currentSessionSpan = this._spanSessionManager.getSessionSpan();
        if (!currentSessionSpan) {
          return;
        }
        currentSessionSpan.addEvent(
          `${EMB_WEB_VITALS_PREFIX}-report-${name}`,
          {
            ...lowCardinalityAtts,
            ...highCardinalityAtts,
          },
          now
        );
      });
    });
  }

  disable(): void {}

  // no-op
  protected init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    | void {
    return;
  }
}
