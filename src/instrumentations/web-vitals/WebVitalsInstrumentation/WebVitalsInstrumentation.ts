import type { Attributes } from '@opentelemetry/api';
import type {
  CLSAttribution,
  INPAttribution,
  LCPAttribution,
  MetricWithAttribution,
} from 'web-vitals/attribution';
import { type Metric } from 'web-vitals/attribution';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.js';
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
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import type { URLDocument } from '../../../common/index.js';

const webVitalAttributionToReport = (
  name: Metric['name'],
  metric: MetricWithAttribution
) => {
  const attributes: Attributes = {};
  const toReport: {
    key: string;
    value: string | boolean | number | undefined;
  }[] = [];

  if (name === 'CLS') {
    // https://www.npmjs.com/package/web-vitals#CLSAttribution
    const attribution = metric.attribution as CLSAttribution;
    toReport.push(
      ...[
        {
          key: 'largestShiftTarget',
          value: attribution.largestShiftTarget,
        },
        {
          key: 'largestShiftValue',
          value: attribution.largestShiftValue,
        },
      ]
    );
  } else if (name === 'INP') {
    // https://www.npmjs.com/package/web-vitals#inpattribution
    const attribution = metric.attribution as INPAttribution;
    toReport.push(
      ...[
        { key: 'interactionTarget', value: attribution.interactionTarget },
        { key: 'interactionType', value: attribution.interactionType },
        { key: 'nextPaintTime', value: attribution.nextPaintTime },
        { key: 'inputDelay', value: attribution.inputDelay },
        { key: 'processingDuration', value: attribution.processingDuration },
        { key: 'presentationDelay', value: attribution.presentationDelay },
        { key: 'totalScriptDuration', value: attribution.totalScriptDuration },
        {
          key: 'totalStyleAndLayoutDuration',
          value: attribution.totalStyleAndLayoutDuration,
        },
        { key: 'totalPaintDuration', value: attribution.totalPaintDuration },
        {
          key: 'totalUnattributedDuration',
          value: attribution.totalUnattributedDuration,
        },
        { key: 'loadState', value: attribution.loadState },
      ]
    );
  } else if (name === 'LCP') {
    // https://www.npmjs.com/package/web-vitals#lcpattribution
    const attribution = metric.attribution as LCPAttribution;
    toReport.push(
      ...[
        { key: 'target', value: attribution.target },
        { key: 'url', value: attribution.url },
        { key: 'timeToFirstByte', value: attribution.timeToFirstByte },
        { key: 'resourceLoadDelay', value: attribution.resourceLoadDelay },
        {
          key: 'resourceLoadDuration',
          value: attribution.resourceLoadDuration,
        },
        { key: 'elementRenderDelay', value: attribution.elementRenderDelay },
      ]
    );
  }

  toReport.forEach(report => {
    if (report.value !== undefined) {
      attributes[`emb.web_vital.attribution.${report.key}`] = report.value;
    }
  });

  return attributes;
};

export class WebVitalsInstrumentation extends EmbraceInstrumentationBase {
  private readonly _metricsToTrack: Metric['name'][];
  private readonly _listeners: WebVitalListeners;
  private readonly _urlDocument: URLDocument;

  // instrumentation that adds an event to the session span for each web vital report
  public constructor({
    diag,
    perf,
    trackingLevel = 'core',
    listeners = WEB_VITALS_ID_TO_LISTENER,
    urlDocument = window.document,
  }: WebVitalsInstrumentationArgs = {}) {
    super({
      instrumentationName: 'WebVitalsInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });
    this._listeners = listeners;
    this._urlDocument = urlDocument;
    this._metricsToTrack =
      trackingLevel === 'core' ? [...CORE_WEB_VITALS] : [...ALL_WEB_VITALS];

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override disable(): void {
    // do nothing.
    // https://github.com/GoogleChrome/web-vitals/issues/357#issuecomment-1593439036
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
          [ATTR_URL_FULL]: this._urlDocument.URL,
          'emb.web_vital.navigation_type': metric.navigationType,
          'emb.web_vital.name': metric.name,
          'emb.web_vital.rating': metric.rating,
          'emb.web_vital.id': metric.id,
          'emb.web_vital.delta': metric.delta,
          'emb.web_vital.value': metric.value,
          ...webVitalAttributionToReport(name, metric),
        };

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
}
