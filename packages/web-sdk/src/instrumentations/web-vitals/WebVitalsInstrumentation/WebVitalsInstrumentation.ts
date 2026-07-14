import type { Attributes, DiagLogger } from '@opentelemetry/api';
import type { LogRecord } from '@opentelemetry/api-logs';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { millisToHrTime } from '@opentelemetry/core';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import type {
  CLSMetricWithAttribution,
  INPAttribution,
  Metric,
  MetricWithAttribution,
  TTFBAttribution,
} from 'web-vitals/attribution';
import type { PageManager } from '../../../api-page/index.ts';
import { page } from '../../../api-page/index.ts';
import type { URLDocument } from '../../../common/index.ts';
import {
  EMB_TYPES,
  KEY_APP_SURFACE_LABEL,
  KEY_BROWSER_URL_FULL,
  KEY_EMB_PAGE_ID,
  KEY_EMB_PAGE_PATH,
  KEY_EMB_TYPE,
} from '../../../constants/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  KEY_BROWSER_WEB_VITAL_DELTA,
  KEY_BROWSER_WEB_VITAL_ID,
  KEY_BROWSER_WEB_VITAL_NAME,
  KEY_BROWSER_WEB_VITAL_NAVIGATION_TYPE,
  KEY_BROWSER_WEB_VITAL_RATING,
  KEY_BROWSER_WEB_VITAL_VALUE,
  KEY_EMB_WEB_VITAL_ATTRIBUTION_PREFIX,
} from './attributes.ts';
import {
  ALL_WEB_VITALS,
  MAX_LOAF_SCRIPT_ENTRIES,
  MAX_LOAF_SCRIPT_URL_LENGTH,
  WEB_VITAL_EVENT_NAME,
  WEB_VITALS_ID_TO_LISTENER,
} from './constants.ts';
import type {
  WebVitalListeners,
  WebVitalsInstrumentationConfig,
} from './types.ts';

type AttributedPage = {
  fullURL: string;
  path?: string;
  pageID?: string;
  label?: string;
};

const roundClamp = (value: number): number => Math.round(Math.max(0, value));

const isPrimitiveValue = (
  value: unknown,
): value is string | number | boolean => {
  const type = typeof value;
  return type === 'number' || type === 'string' || type === 'boolean';
};

const loafScriptsAttribution = (
  metric: MetricWithAttribution,
  diag: DiagLogger,
): Attributes => {
  const attributes: Attributes = {};
  const attribution = metric.attribution as INPAttribution;

  try {
    // suppress LoAF baseline errors
    /* eslint-disable baseline-js/use-baseline */
    if (attribution.longAnimationFrameEntries.length > 0) {
      const scripts = new Map<
        string,
        {
          totalDuration: number;
          styleAndLayoutDuration: number;
          count: number;
        }
      >();
      for (const entry of attribution.longAnimationFrameEntries) {
        for (const script of entry.scripts) {
          let url = script.sourceURL || '(inline)';
          if (url.length > MAX_LOAF_SCRIPT_URL_LENGTH) {
            url = `${url.substring(0, MAX_LOAF_SCRIPT_URL_LENGTH)}...`;
          }
          const existing = scripts.get(url);
          if (existing) {
            existing.totalDuration += script.duration;
            existing.styleAndLayoutDuration +=
              script.forcedStyleAndLayoutDuration;
            existing.count++;
          } else {
            scripts.set(url, {
              totalDuration: script.duration,
              styleAndLayoutDuration: script.forcedStyleAndLayoutDuration,
              count: 1,
            });
          }
        }
      }
      if (scripts.size > 0) {
        attributes[`${KEY_EMB_WEB_VITAL_ATTRIBUTION_PREFIX}loaf_scripts`] =
          JSON.stringify(
            Object.fromEntries(
              [...scripts]
                .sort((a, b) => b[1].totalDuration - a[1].totalDuration)
                .slice(0, MAX_LOAF_SCRIPT_ENTRIES)
                .map(([url, script]) => [
                  url,
                  {
                    total_duration: Math.round(script.totalDuration),
                    style_and_layout_duration: Math.round(
                      script.styleAndLayoutDuration,
                    ),
                    count: script.count,
                  },
                ]),
            ),
          );
      }
    }
    /* eslint-enable baseline-js/use-baseline */
  } catch (e) {
    diag.error('error building loaf scripts for INP', e);
  }

  return attributes;
};

const ttfbSubPartsAttribution = (
  metric: MetricWithAttribution,
  diag: DiagLogger,
): Attributes => {
  const attributes: Attributes = {};
  const attribution = metric.attribution as TTFBAttribution;
  const entry = attribution.navigationEntry as
    | PerformanceNavigationTiming
    | undefined;

  if (entry) {
    try {
      const redirect = roundClamp(entry.redirectEnd - entry.redirectStart);
      const domainLookup = roundClamp(
        entry.domainLookupEnd - entry.domainLookupStart,
      );
      const tcpConnection = roundClamp(
        entry.secureConnectionStart > 0
          ? entry.secureConnectionStart - entry.connectStart
          : entry.connectEnd - entry.connectStart,
      );
      const tlsNegotiation = roundClamp(
        entry.secureConnectionStart > 0
          ? entry.connectEnd - entry.secureConnectionStart
          : 0,
      );
      const effectiveResponseStart = Math.max(
        // @ts-expect-error 103 Early hints are not supported in all browsers
        // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/finalResponseHeadersStart
        entry.finalResponseHeadersStart ?? 0,
        entry.responseStart,
      );
      const serverResponse = roundClamp(
        effectiveResponseStart - entry.requestStart,
      );
      const total = Math.round(entry.responseEnd - entry.startTime);
      const unattributed = roundClamp(
        total -
          redirect -
          domainLookup -
          tcpConnection -
          tlsNegotiation -
          serverResponse,
      );
      const prefix = KEY_EMB_WEB_VITAL_ATTRIBUTION_PREFIX;
      attributes[`${prefix}redirect`] = redirect;
      attributes[`${prefix}domainLookup`] = domainLookup;
      attributes[`${prefix}tcpConnection`] = tcpConnection;
      attributes[`${prefix}tlsNegotiation`] = tlsNegotiation;
      attributes[`${prefix}serverResponse`] = serverResponse;
      attributes[`${prefix}unattributed`] = unattributed;
    } catch (e) {
      diag.error('error computing TTFB timing breakdown', e);
    }
  } else {
    diag.debug('TTFB navigationEntry unavailable, skipping timing breakdown');
  }

  return attributes;
};

// Timing frame: time-origin (see src/utils/PerformanceManager/README.md)
export class WebVitalsInstrumentation extends EmbraceInstrumentationBase {
  private readonly _listeners: WebVitalListeners;
  private readonly _urlDocument: URLDocument;
  private readonly _urlAttribution: boolean;
  private readonly _includeRawAttribution: boolean;
  private readonly _pageManager: PageManager;
  private readonly _attributedPage: Record<
    Metric['name'],
    AttributedPage | undefined
  > = {
    INP: undefined,
    LCP: undefined,
    CLS: undefined,
    FCP: undefined,
    TTFB: undefined,
  };
  private _largestShiftTargetForCLS: string | undefined | null = null;
  private _applyCustomLogRecordData?: (logRecord: LogRecord) => void;
  private _listenersRegistered = false;

  public constructor({
    diag,
    perf,
    listeners = WEB_VITALS_ID_TO_LISTENER,
    urlDocument,
    urlAttribution = true,
    includeRawAttribution = true,
    pageManager,
    applyCustomLogRecordData,
    ...config
  }: WebVitalsInstrumentationConfig = {}) {
    super({
      instrumentationName: 'WebVitalsInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config,
    });
    this._listeners = listeners;
    this._urlDocument = urlDocument ?? window.document;
    this._urlAttribution = urlAttribution;
    this._includeRawAttribution = includeRawAttribution;
    this._pageManager = pageManager ?? page.getPageManager();
    this._applyCustomLogRecordData = applyCustomLogRecordData;

    if (this._config.enabled !== false) {
      this.enable();
    }
  }

  public override onDisable(): void {
    // web-vitals library doesn't support removing listeners, so we just pause emission
    // https://github.com/GoogleChrome/web-vitals/issues/357#issuecomment-1593439036
    this._diag.debug('WebVitalsInstrumentation disabled, pausing emission');
  }

  public override enable(): void {
    if (typeof PerformanceObserver !== 'undefined') {
      super.enable();
    } else {
      this._diag.debug(
        'PerformanceObserver not supported, web vitals will not be collected',
      );
    }
  }

  public override onEnable(): void {
    // web-vitals library doesn't support removing listeners, so only register once
    if (this._listenersRegistered) {
      this._diag.debug(
        'WebVitalsInstrumentation listeners already registered, resuming emission',
      );
      return;
    }
    this._listenersRegistered = true;

    ALL_WEB_VITALS.forEach((name) => {
      if (this._urlAttribution) {
        this._listeners[name]?.(
          (metric) => {
            if (!this._isEnabled) {
              return;
            }
            if (metric.name === 'CLS') {
              const clsMetric = metric as CLSMetricWithAttribution;
              // CLS is cumulative — the rating can update without the shift target changing pages.
              // Only update the attributed page when largestShiftTarget changes so the URL reflects
              // the page where the dominant shift element actually appeared.
              if (
                this._largestShiftTargetForCLS !==
                clsMetric.attribution.largestShiftTarget
              ) {
                this._largestShiftTargetForCLS =
                  clsMetric.attribution.largestShiftTarget;
                this._attributedPage.CLS = this._currentAttributedPage();
              }
            } else {
              this._attributedPage[metric.name] = this._currentAttributedPage();
            }
          },
          { reportAllChanges: true },
        );
      }

      this._listeners[name]?.((metric) => {
        if (!this._isEnabled) {
          return;
        }
        this._emitWebVital(metric);
      });
    });
  }

  private _currentAttributedPage(): AttributedPage {
    return {
      fullURL: this._urlDocument.URL,
      path: this._pageManager.getCurrentRoute()?.path,
      pageID: this._pageManager.getCurrentPageId() ?? undefined,
      label: this._pageManager.getPageLabel() ?? undefined,
    };
  }

  private _getTimeForMetric(metric: MetricWithAttribution): number {
    if (metric.name === 'CLS' && metric.attribution.largestShiftTime) {
      return this.perf.epochMillisFromOrigin(
        metric.attribution.largestShiftTime,
      );
    }

    if (metric.name === 'INP' && metric.attribution.interactionTime) {
      return this.perf.epochMillisFromOrigin(
        metric.attribution.interactionTime,
      );
    }

    return this.perf.getNowMillis();
  }

  private _emitWebVital(metric: MetricWithAttribution): void {
    const attributedPage = this._attributedPage[metric.name];
    const logRecord: LogRecord = {
      eventName: WEB_VITAL_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
        [KEY_BROWSER_WEB_VITAL_NAME]: metric.name.toLowerCase(),
        [KEY_BROWSER_WEB_VITAL_VALUE]: metric.value,
        [KEY_BROWSER_WEB_VITAL_DELTA]: metric.delta,
        [KEY_BROWSER_WEB_VITAL_RATING]: metric.rating,
        [KEY_BROWSER_WEB_VITAL_ID]: metric.id,
        [KEY_BROWSER_WEB_VITAL_NAVIGATION_TYPE]: metric.navigationType,
        ...(attributedPage
          ? {
              [KEY_BROWSER_URL_FULL]: attributedPage.fullURL,
              [KEY_EMB_PAGE_PATH]: attributedPage.path,
              [KEY_EMB_PAGE_ID]: attributedPage.pageID,
              [KEY_APP_SURFACE_LABEL]: attributedPage.label,
            }
          : {}),
        ...(metric.name === 'INP'
          ? loafScriptsAttribution(metric, this._diag)
          : {}),
        ...(metric.name === 'TTFB'
          ? ttfbSubPartsAttribution(metric, this._diag)
          : {}),
      },
      body:
        this._includeRawAttribution && metric.attribution != null
          ? JSON.stringify(
              Object.fromEntries(
                Object.entries(metric.attribution).filter(([, v]) =>
                  isPrimitiveValue(v),
                ),
              ),
            )
          : undefined,
      timestamp: millisToHrTime(this._getTimeForMetric(metric)),
    };

    if (this._applyCustomLogRecordData) {
      safeExecuteInTheMiddle(
        () => this._applyCustomLogRecordData?.(logRecord),
        (error) => {
          if (error) {
            this._diag.error('applyCustomLogRecordData hook failed', error);
          }
        },
        true,
      );
    }

    this.logger.emit(logRecord);
  }
}
