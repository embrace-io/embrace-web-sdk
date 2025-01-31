import {InstrumentationModuleDefinition} from '@opentelemetry/instrumentation';
import {InstrumentationBase} from '../../InstrumentationBase';
import {Attributes, Gauge, MeterProvider} from '@opentelemetry/api';
import {type Metric} from 'web-vitals/attribution';
import {SpanSessionProvider} from '../../../api-sessions';
import {
  CORE_WEB_VITALS,
  EMB_WEB_VITALS_PREFIX,
  METER_NAME,
  NOT_CORE_WEB_VITALS,
  WEB_VITALS_ID_TO_LISTENER,
} from './constants';
import {TrackingLevel, WebVitalsInstrumentationArgs} from './types';

export class WebVitalsInstrumentation extends InstrumentationBase {
  //map of web vitals to gauges to emit to
  private readonly _gauges: Partial<Record<Metric['name'], Gauge>>;
  private readonly _trackingLevel: TrackingLevel;
  private readonly _spanSessionProvider: SpanSessionProvider;
  private readonly _meterProvider: MeterProvider;

  // function that emits a metric for each web vital report
  constructor({
    trackingLevel = 'core',
    spanSessionProvider,
    meterProvider,
  }: WebVitalsInstrumentationArgs) {
    super('WebVitalsInstrumentation', '1.0.0', {});
    this._gauges = {};
    this._spanSessionProvider = spanSessionProvider;
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
        },
      );
    });
    if (this._trackingLevel === 'all') {
      NOT_CORE_WEB_VITALS.forEach(name => {
        this._gauges[name] = meter.createGauge(
          `${EMB_WEB_VITALS_PREFIX}-${name}`,
          {
            description: `Embrace instrumentation - emits a metric for each web vital report for ${name}`,
          },
        );
      });
    }
    Object.keys(this._gauges).forEach(name => {
      WEB_VITALS_ID_TO_LISTENER[name as Metric['name']](metric => {
        // first thing record the time when this cb was invoked
        const now = Date.now();
        // we split the atts into low cardinality and high cardinality so we only report the low cardinality ones as metrics
        // and keep the high cardinality ones for the span event representation
        const lowCardinalityAtts: Attributes = {
          navigationType: metric.navigationType,
          name: metric.name,
          rating: metric.rating,
        };

        this._gauges[name as Metric['name']]?.record(
          metric.value,
          lowCardinalityAtts,
        );
        const highCardinalityAtts: Attributes = {
          id: metric.id,
          entries: JSON.stringify(metric.entries),
          delta: metric.delta,
          value: metric.value,
          pageURL: document.URL,
        };
        Object.entries(metric.attribution).forEach(([key, value]) => {
          highCardinalityAtts[`attribution.${key}`] =
            typeof value === 'number' ? value : JSON.stringify(value);
        });
        const currentSessionSpan = this._spanSessionProvider.getSessionSpan();
        if (!currentSessionSpan) {
          return;
        }
        currentSessionSpan.addEvent(
          `${EMB_WEB_VITALS_PREFIX}-report-${name}`,
          {
            ...lowCardinalityAtts,
            ...highCardinalityAtts,
          },
          now,
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
