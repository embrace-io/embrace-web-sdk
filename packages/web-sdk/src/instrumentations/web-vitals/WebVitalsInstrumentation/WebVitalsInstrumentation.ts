import type { Attributes, DiagLogger } from '@opentelemetry/api';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import type {
  CLSAttribution,
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

type NavigationTimingWithEarlyHints = PerformanceNavigationTiming & {
  finalResponseHeadersStart?: number;
};

type AttributedPage = {
  fullURL: string;
  path?: string;
  pageID?: string;
  label?: string;
};

const webVitalAttributionToReport = (
  name: Metric['name'],
  metric: MetricWithAttribution,
  diag: DiagLogger,
) => {
  const attributes: Attributes = {};
  const toReport: {
    key: string;
    value: string | boolean | number | undefined;
  }[] = [];

  if (name === 'CLS') {
    // https://github.com/GoogleChrome/web-vitals#CLSAttribution
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
      ],
    );
  } else if (name === 'INP') {
    // https://github.com/GoogleChrome/web-vitals#inpattribution
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
      ],
    );

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
          toReport.push({
            key: 'loaf_scripts',
            value: JSON.stringify(
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
            ),
          });
        }
      }
      /* eslint-enable baseline-js/use-baseline */
    } catch (e) {
      diag.error('error building loaf scripts for INP', e);
    }
  } else if (name === 'LCP') {
    // https://github.com/GoogleChrome/web-vitals#lcpattribution
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
      ],
    );
  } else if (name === 'TTFB') {
    // https://github.com/GoogleChrome/web-vitals#ttfbattribution
    const attribution = metric.attribution as TTFBAttribution;
    const entry = attribution.navigationEntry as
      | NavigationTimingWithEarlyHints
      | undefined;
    if (entry) {
      try {
        const redirect = Math.max(0, entry.redirectEnd - entry.redirectStart);
        const domainLookup = Math.max(
          0,
          entry.domainLookupEnd - entry.domainLookupStart,
        );
        const tcpConnection = Math.max(
          0,
          entry.secureConnectionStart > 0
            ? entry.secureConnectionStart - entry.connectStart
            : entry.connectEnd - entry.connectStart,
        );
        const tlsNegotiation = Math.max(
          0,
          entry.secureConnectionStart > 0
            ? entry.connectEnd - entry.secureConnectionStart
            : 0,
        );
        const effectiveResponseStart = Math.max(
          entry.finalResponseHeadersStart ?? 0,
          entry.responseStart,
        );
        const serverResponse = Math.max(
          0,
          effectiveResponseStart - entry.requestStart,
        );
        const unattributed = Math.max(
          0,
          entry.responseEnd -
            entry.startTime -
            redirect -
            domainLookup -
            tcpConnection -
            tlsNegotiation -
            serverResponse,
        );
        toReport.push(
          { key: 'redirect', value: Math.round(redirect) },
          { key: 'domainLookup', value: Math.round(domainLookup) },
          { key: 'tcpConnection', value: Math.round(tcpConnection) },
          { key: 'tlsNegotiation', value: Math.round(tlsNegotiation) },
          { key: 'serverResponse', value: Math.round(serverResponse) },
          { key: 'unattributed', value: Math.round(unattributed) },
        );
      } catch (e) {
        diag.error('error computing TTFB timing breakdown', e);
      }
    } else {
      diag.debug('TTFB navigationEntry unavailable, skipping timing breakdown');
    }
  }

  toReport.forEach((report) => {
    if (report.value !== undefined) {
      attributes[`emb.web_vital.attribution.${report.key}`] = report.value;
    }
  });

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
          'emb.web_vital.navigation_type': metric.navigationType,
          'emb.web_vital.name': metric.name,
          'emb.web_vital.rating': metric.rating,
          'emb.web_vital.id': metric.id,
          'emb.web_vital.delta': metric.delta,
          'emb.web_vital.value': metric.value,
          ...webVitalAttributionToReport(name, metric, this._diag),
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
        () => {
          this._attributedPage.LCP = this._currentAttributedPage();
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
