import type {
  Attributes,
  AttributeValue,
  DiagLogger,
} from '@opentelemetry/api';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
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
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  KEY_EMB_WEB_VITAL_ATTRIBUTION_PREFIX,
  KEY_EMB_WEB_VITAL_DELTA,
  KEY_EMB_WEB_VITAL_ID,
  KEY_EMB_WEB_VITAL_NAME,
  KEY_EMB_WEB_VITAL_NAVIGATION_TYPE,
  KEY_EMB_WEB_VITAL_RATING,
  KEY_EMB_WEB_VITAL_VALUE,
} from './attributes.ts';
import {
  ALL_WEB_VITALS,
  EMB_WEB_VITALS_PREFIX,
  MAX_LOAF_SCRIPT_ENTRIES,
  MAX_LOAF_SCRIPT_URL_LENGTH,
  WEB_VITALS_ID_TO_LISTENER,
} from './constants.ts';
import type {
  WebVitalListeners,
  WebVitalsInstrumentationArgs,
} from './types.ts';

type AttributedPage = {
  fullURL: string;
  path?: string;
  pageID?: string;
  label?: string;
};

const isPrimitiveValue = (value: unknown): value is AttributeValue => {
  const type = typeof value;
  return type === 'number' || type === 'string' || type === 'boolean';
};

const roundClamp = (value: number): number => Math.round(Math.max(0, value));

const webVitalAttributionToReport = (
  metric: MetricWithAttribution,
): Attributes => {
  const attributes: Attributes = {};
  const attribution = metric.attribution;

  if (!attribution || typeof attribution !== 'object') {
    return attributes;
  }

  for (const [key, value] of Object.entries(attribution)) {
    if (isPrimitiveValue(value)) {
      attributes[`${KEY_EMB_WEB_VITAL_ATTRIBUTION_PREFIX}${key}`] = value;
    }
  }

  return attributes;
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

export class WebVitalsInstrumentation extends EmbraceInstrumentationBase {
  private readonly _listeners: WebVitalListeners;
  private readonly _urlDocument: URLDocument;
  private readonly _urlAttribution: boolean;
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
  private _largestShiftTargetForCLS: string | undefined;
  // The primary LCP listener only processes the final entry (entries.slice(-1)
  // in web-vitals/onLCP.ts), which is typically flushed via takeRecords() after
  // user input. By then the LCP element may be detached and entry.element
  // returns null, so the selector is lost. The reportAllChanges listener below
  // runs on every candidate as it dispatches, while the node is still attached,
  // and caches the target so we can back-fill the final report.
  private _lcpTarget: { metricId: string; target: string } | undefined;
  private _listenersRegistered = false;
  private _isEnabled = false;

  // instrumentation that adds an event to the session span for each web vital report
  public constructor({
    diag,
    perf,
    listeners = WEB_VITALS_ID_TO_LISTENER,
    urlDocument = window.document,
    urlAttribution = true,
    pageManager,
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
    this._urlAttribution = urlAttribution;
    this._pageManager = pageManager ?? page.getPageManager();

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override disable(): void {
    // web-vitals library doesn't support removing listeners, so we just pause emission
    // https://github.com/GoogleChrome/web-vitals/issues/357#issuecomment-1593439036
    this._isEnabled = false;
    this._diag.debug('WebVitalsInstrumentation disabled, pausing emission');
  }

  public enable(): void {
    this._isEnabled = true;

    // web-vitals library doesn't support removing listeners, so only register once
    if (this._listenersRegistered) {
      this._diag.debug(
        'WebVitalsInstrumentation listeners already registered, resuming emission',
      );
      return;
    }
    this._listenersRegistered = true;

    ALL_WEB_VITALS.forEach((name) => {
      this._listeners[name]?.((metric) => {
        if (!this._isEnabled) {
          return;
        }

        const currentSessionSpan = this.sessionManager.getSessionSpan();

        if (!currentSessionSpan) {
          return;
        }

        // first thing record the time when this cb was invoked
        const metricTime = this._getTimeForMetric(metric);

        const attributedPage = this._getAttributedPageForMetric(metric);

        const attrs: Attributes = {
          [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
          [ATTR_URL_FULL]: attributedPage.fullURL,
          [KEY_BROWSER_URL_FULL]: attributedPage.fullURL,
          [KEY_EMB_WEB_VITAL_NAVIGATION_TYPE]: metric.navigationType,
          [KEY_EMB_WEB_VITAL_NAME]: metric.name,
          [KEY_EMB_WEB_VITAL_RATING]: metric.rating,
          [KEY_EMB_WEB_VITAL_ID]: metric.id,
          [KEY_EMB_WEB_VITAL_DELTA]: metric.delta,
          [KEY_EMB_WEB_VITAL_VALUE]: metric.value,
          ...webVitalAttributionToReport(metric),
          ...this._backfillTargetAttribution(metric),
          ...(name === 'INP' ? loafScriptsAttribution(metric, this._diag) : {}),
          ...(name === 'TTFB'
            ? ttfbSubPartsAttribution(metric, this._diag)
            : {}),
        };

        // Add page attributes if route and page ID exist
        if (attributedPage.path && attributedPage.pageID) {
          attrs[KEY_EMB_PAGE_PATH] = attributedPage.path;
          attrs[KEY_EMB_PAGE_ID] = attributedPage.pageID;
        }

        if (attributedPage.label) {
          attrs[KEY_APP_SURFACE_LABEL] = attributedPage.label;
        }

        currentSessionSpan.addEvent(
          `${EMB_WEB_VITALS_PREFIX}-report-${name}`,
          attrs,
          metricTime,
        );
      });
    });

    if (this._urlAttribution) {
      // When these web vitals make their final report (e.g. when the listeners w/ reportAllChanges=false trigger) the
      // document's URL at that time may not match what it was at the time the scores were last updated. Instead, listen
      // for updates to the scores and keep track of the Page information to attribute for each
      this._listeners.TTFB?.(
        () => {
          this._attributedPage.TTFB = this._currentAttributedPage();
        },
        {
          reportAllChanges: true,
        },
      );
      this._listeners.FCP?.(
        () => {
          this._attributedPage.FCP = this._currentAttributedPage();
        },
        {
          reportAllChanges: true,
        },
      );
      this._listeners.INP?.(
        () => {
          this._attributedPage.INP = this._currentAttributedPage();
        },
        {
          reportAllChanges: true,
        },
      );
      this._listeners.LCP?.(
        (metric: MetricWithAttribution) => {
          this._attributedPage.LCP = this._currentAttributedPage();
          const attribution = metric.attribution as LCPAttribution;
          if (attribution.target) {
            this._lcpTarget = {
              metricId: metric.id,
              target: attribution.target,
            };
          }
        },
        {
          reportAllChanges: true,
        },
      );
      this._listeners.CLS?.(
        (metric: MetricWithAttribution) => {
          const clsMetric = metric as CLSMetricWithAttribution;
          // A layout shift could cause CLS to change its rating but because the score is cumulative this might not
          // correspond with an updated `largestShiftTarget`. Since we want to tie the attributed URL to the page that
          // the `largestShiftTarget` was on we only update the attributed URL if that target has changed
          if (
            this._largestShiftTargetForCLS !==
            clsMetric.attribution.largestShiftTarget
          ) {
            this._largestShiftTargetForCLS =
              clsMetric.attribution.largestShiftTarget;
            this._attributedPage.CLS = this._currentAttributedPage();
          }
        },
        {
          reportAllChanges: true,
        },
      );
    }
  }

  private _backfillTargetAttribution(
    metric: MetricWithAttribution,
  ): Attributes {
    const attrs: Attributes = {};
    const prefix = KEY_EMB_WEB_VITAL_ATTRIBUTION_PREFIX;

    if (metric.name === 'LCP') {
      const attribution = metric.attribution as LCPAttribution;
      if (!attribution.target && this._lcpTarget?.metricId === metric.id) {
        attrs[`${prefix}target`] = this._lcpTarget.target;
      }
    }

    return attrs;
  }

  private _getTimeForMetric(metric: MetricWithAttribution): number {
    if (metric.name === 'CLS' && metric.attribution.largestShiftTime) {
      return this.perf.epochMillisFromOriginOffset(
        metric.attribution.largestShiftTime,
      );
    }

    if (metric.name === 'INP' && metric.attribution.interactionTime) {
      return this.perf.epochMillisFromOriginOffset(
        metric.attribution.interactionTime,
      );
    }

    return this.perf.getNowMillis();
  }

  private _currentAttributedPage(): AttributedPage {
    const attributed: AttributedPage = {
      fullURL: this._urlDocument.URL,
    };

    const currentRoute = this._pageManager.getCurrentRoute();
    const currentPageId = this._pageManager.getCurrentPageId();
    if (currentRoute && currentPageId) {
      attributed.path = currentRoute.path;
      attributed.pageID = currentPageId;
    }

    const pageLabel = this._pageManager.getPageLabel();
    if (pageLabel) {
      attributed.label = pageLabel;
    }

    return attributed;
  }

  private _getAttributedPageForMetric(
    metric: MetricWithAttribution,
  ): AttributedPage {
    if (metric.name === 'FCP' && this._attributedPage.FCP) {
      return this._attributedPage.FCP;
    }

    if (metric.name === 'TTFB' && this._attributedPage.TTFB) {
      return this._attributedPage.TTFB;
    }

    if (metric.name === 'INP' && this._attributedPage.INP) {
      return this._attributedPage.INP;
    }

    if (metric.name === 'LCP' && this._attributedPage.LCP) {
      return this._attributedPage.LCP;
    }

    if (
      metric.name === 'CLS' &&
      this._attributedPage.CLS &&
      metric.attribution.largestShiftTarget === this._largestShiftTargetForCLS
    ) {
      return this._attributedPage.CLS;
    }

    return this._currentAttributedPage();
  }
}
