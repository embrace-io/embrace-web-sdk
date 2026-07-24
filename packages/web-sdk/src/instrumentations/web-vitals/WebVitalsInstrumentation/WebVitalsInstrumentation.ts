import type { Attributes, DiagLogger } from '@opentelemetry/api';
import type { LogRecord } from '@opentelemetry/api-logs';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { millisToHrTime } from '@opentelemetry/core';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import type {
  CLSMetricWithAttribution,
  INPAttribution,
  LCPAttribution,
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
import { isEntryTypeSupported } from '../../../utils/performanceObserver/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  KEY_BROWSER_WEB_VITAL_DELTA,
  KEY_BROWSER_WEB_VITAL_ID,
  KEY_BROWSER_WEB_VITAL_INTERACTION_ID,
  KEY_BROWSER_WEB_VITAL_NAME,
  KEY_BROWSER_WEB_VITAL_NAVIGATION_ID,
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

const inpAttribution = (
  metric: MetricWithAttribution,
  diag: DiagLogger,
): Attributes => {
  const attributes: Attributes = {};

  try {
    /* eslint-disable baseline-js/use-baseline */
    const target = (metric.entries as PerformanceEventTiming[]).find(
      (entry) => entry.target,
    )?.target as Element | null | undefined;

    const tagName = target?.tagName?.toLowerCase();

    if (tagName) {
      attributes[`${KEY_EMB_WEB_VITAL_ATTRIBUTION_PREFIX}element_type`] =
        tagName;
    }

    /* eslint-enable baseline-js/use-baseline */
  } catch (e) {
    diag.error('error building INP element type attribution', e);
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

const lcpElementAttribution = (
  metric: MetricWithAttribution,
  diag: DiagLogger,
): Attributes => {
  const attributes: Attributes = {};

  try {
    const attribution = metric.attribution as LCPAttribution;
    const element = attribution.lcpEntry?.element;

    if (element) {
      const prefix = KEY_EMB_WEB_VITAL_ATTRIBUTION_PREFIX;
      const rect = element.getBoundingClientRect();
      attributes[`${prefix}elementType`] = element.tagName.toLowerCase();
      // x/y are intentionally not clamped: an element scrolled above the
      // viewport legitimately has a negative position.
      attributes[`${prefix}elementBoundingRect`] = JSON.stringify({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
  } catch (e) {
    diag.error('error building LCP element attribution', e);
  }

  return attributes;
};

export class WebVitalsInstrumentation extends EmbraceInstrumentationBase {
  private readonly _listeners: WebVitalListeners;
  private readonly _urlDocument: URLDocument;
  private readonly _urlAttribution: boolean;
  private readonly _includeRawAttribution: boolean;
  private readonly _softNavsActive: boolean;
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
  private _clsMetricId: string | undefined = undefined;
  private _applyCustomLogRecordData?: (logRecord: LogRecord) => void;
  private _listenersRegistered = false;

  public constructor({
    diag,
    perf,
    listeners = WEB_VITALS_ID_TO_LISTENER,
    urlDocument,
    urlAttribution = true,
    includeRawAttribution = true,
    reportSoftNavs = true,
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
    this._softNavsActive =
      reportSoftNavs && isEntryTypeSupported('soft-navigation');
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
      // web-vitals reports a hardcoded dummy value of zero for TTFB on soft navigations. That
      // is not a real measurement and would skew the data, so TTFB listeners keep soft
      // navigation reporting off.
      const reportSoftNavs = name !== 'TTFB' && this._softNavsActive;

      if (this._urlAttribution) {
        this._listeners[name]?.(
          (metric) => {
            if (!this._isEnabled) {
              return;
            }
            if (metric.name === 'CLS') {
              const clsMetric = metric as CLSMetricWithAttribution;
              const target = clsMetric.attribution.largestShiftTarget;

              if (this._clsMetricId !== clsMetric.id) {
                // A new metric ID means CLS has reset for a soft navigation.
                this._clsMetricId = clsMetric.id;
                this._largestShiftTargetForCLS = target;
                this._attributedPage.CLS = this._currentAttributedPage();
              } else if (this._largestShiftTargetForCLS !== target) {
                // When the largest shift target changes, make sure the attributed page is updated
                // to reflect the page where that shift occurred.
                this._largestShiftTargetForCLS = target;
                this._attributedPage.CLS = this._currentAttributedPage();
              }
            } else {
              this._attributedPage[metric.name] = this._currentAttributedPage();
            }
          },
          { reportAllChanges: true, reportSoftNavs },
        );
      }

      this._listeners[name]?.(
        (metric) => {
          if (!this._isEnabled) {
            return;
          }
          this._emitWebVital(metric);
        },
        { reportSoftNavs },
      );
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
    // For INP use interactionTime, which is the start time of the user's interaction
    if (
      metric.name === 'INP' &&
      metric.attribution.interactionTime !== undefined
    ) {
      return this.perf.epochMillisFromOrigin(
        metric.attribution.interactionTime,
      );
    }

    // For CLS use the first layout shift's startTime, which is the beginning of
    // the  session window. Fall back to largestShiftTime if the entries aren't
    // available for some reason.
    if (metric.name === 'CLS') {
      const windowStart =
        metric.entries.length > 0
          ? Math.min(...metric.entries.map((entry) => entry.startTime))
          : metric.attribution.largestShiftTime;

      if (windowStart !== undefined) {
        return this.perf.epochMillisFromOrigin(windowStart);
      }
    }

    // For TTFB use the "zero" time of the current session part
    if (metric.name === 'TTFB') {
      return this.perf.getZeroTime();
    }

    // For other metrics, use the startTime of the last entry. Note: in practice, web-vitals does
    // not emit multiple entries for metrics other than CLS. However to future-proof this code,
    // we are assuming that the last entry is the most relevant one.
    const metricStartTime =
      metric.entries[metric.entries.length - 1]?.startTime;

    if (metricStartTime !== undefined) {
      return this.perf.epochMillisFromOrigin(metricStartTime);
    }

    // Fall back to when the metric was reported
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
        ...(metric.navigationId !== undefined
          ? { [KEY_BROWSER_WEB_VITAL_NAVIGATION_ID]: metric.navigationId }
          : {}),
        ...(metric.navigationInteractionId !== undefined
          ? {
              [KEY_BROWSER_WEB_VITAL_INTERACTION_ID]:
                metric.navigationInteractionId,
            }
          : {}),
        ...(attributedPage
          ? {
              // The navigationURL emitted by web-vitals is authoritative for which URL the metric
              // belongs to, since it was captured when the metric occurred. When soft navigations
              // are not supported, we fall back to the attributed page.
              [KEY_BROWSER_URL_FULL]:
                metric.navigationURL != null &&
                (metric.navigationType === 'soft-navigation' ||
                  this._softNavsActive)
                  ? metric.navigationURL
                  : attributedPage.fullURL,
              [KEY_EMB_PAGE_PATH]: attributedPage.path,
              [KEY_EMB_PAGE_ID]: attributedPage.pageID,
              [KEY_APP_SURFACE_LABEL]: attributedPage.label,
            }
          : {}),
        ...(metric.name === 'INP'
          ? loafScriptsAttribution(metric, this._diag)
          : {}),
        ...(metric.name === 'INP' ? inpAttribution(metric, this._diag) : {}),
        ...(metric.name === 'TTFB'
          ? ttfbSubPartsAttribution(metric, this._diag)
          : {}),
        ...(metric.name === 'LCP'
          ? lcpElementAttribution(metric, this._diag)
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
