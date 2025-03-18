import type { Attributes, Gauge, MeterProvider } from '@opentelemetry/api';
import type { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import { type Metric } from 'web-vitals/attribution';
import type { SpanSessionManager } from '../../../api-sessions/index.js';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.js';
import type { PerformanceManager } from '../../../utils/index.js';
import {
  OTelPerformanceManager,
  withErrorFallback
} from '../../../utils/index.js';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import {
  CORE_WEB_VITALS,
  EMB_WEB_VITALS_PREFIX,
  METER_NAME,
  NOT_CORE_WEB_VITALS,
  WEB_VITALS_ID_TO_LISTENER
} from './constants.js';
import type { TrackingLevel, WebVitalsInstrumentationArgs } from './types.js';

export class WebVitalsInstrumentation extends InstrumentationBase {
  //map of web vitals to gauges to emit to
  private readonly _gauges: Partial<Record<Metric['name'], Gauge>>;
  private readonly _trackingLevel: TrackingLevel;
  private readonly _spanSessionManager: SpanSessionManager;
  private readonly _meterProvider: MeterProvider;
  private readonly _perf: PerformanceManager;

  // function that emits a metric for each web vital report
  public constructor({
    trackingLevel = 'core',
    spanSessionManager,
    meterProvider,
    perf = new OTelPerformanceManager()
  }: WebVitalsInstrumentationArgs) {
    super('WebVitalsInstrumentation', '1.0.0', {});
    this._gauges = {};
    this._spanSessionManager = spanSessionManager;
    this._meterProvider = meterProvider;
    this._trackingLevel = trackingLevel;
    this._perf = perf;

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override disable(): void {
    // do nothing.
  }

  public enable(): void {
    const meter = this._meterProvider.getMeter(METER_NAME);
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
      WEB_VITALS_ID_TO_LISTENER[name as Metric['name']](metric => {
        // first thing record the time when this cb was invoked
        const now = this._perf.getNowMillis();
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
          'emb.web_vital.entries': JSON.stringify(metric.entries),
          'emb.web_vital.delta': metric.delta,
          'emb.web_vital.value': metric.value,
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
        const currentSessionSpan = this._spanSessionManager.getSessionSpan();
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
