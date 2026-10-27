import type { Attributes } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { isUrlIgnored, millisToHrTime } from '@opentelemetry/core';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import type { PageManager } from '../../../api-page/index.ts';
import { page } from '../../../api-page/index.ts';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.ts';
import type { TimeoutRef } from '../../../utils/index.ts';
import { createPerformanceObserver, resolveUrl } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { PageLoadType } from './constants.ts';
import {
  ATTR_PAGE_LOAD_DURATION,
  ATTR_PAGE_LOAD_TYPE,
  PAGE_LOAD_EVENT_NAME,
  PAGE_LOAD_QUIET_WINDOW_MS,
} from './constants.ts';
import type { PageLoad, PageLoadInstrumentationArgs } from './types.ts';

// Times are epoch milliseconds.
interface PageView {
  type: PageLoadType;
  startTime: number;
  // When the load event finished. A route change has none to wait for, so it
  // starts out as the view start.
  loadEnd: number | null;
  // When activity last stopped, once a full quiet window has passed since. Null
  // while the page is still busy.
  settledAt: number | null;
}

interface XHRRequest {
  // Unset for a request opened before the patch, which is tracked unfiltered.
  url?: string;
  // Set while the request is in flight.
  end?: () => void;
}

/*
  Emits one `page-load` log per page view once the page has finished loading:
  no request in flight, and no DOM mutation or resource load for a quiet window.
  The first view is the hard navigation, which also waits for the load event.
  Each route change after it starts a new view and abandons one still loading.
*/
export class PageLoadInstrumentation extends EmbraceInstrumentationBase {
  private readonly _pageManager: PageManager;
  private readonly _ignoreUrls: Array<string | RegExp>;
  private readonly _applyCustomAttributesOnLog: PageLoadInstrumentationArgs['applyCustomAttributesOnLog'];
  private readonly _mutationObserver: MutationObserver;
  private readonly _xhrRequests = new WeakMap<XMLHttpRequest, XHRRequest>();
  private _resourceObserver: PerformanceObserver | null = null;
  private _observing: boolean = false;
  private _removeRouteChangedListener: (() => void) | null = null;
  private _view: PageView | null = null;
  private _pageId: string | null = null;
  private _initialViewStarted: boolean = false;
  private _inFlight = 0;
  private _quietTimer: TimeoutRef | null = null;
  private _loadTimer: TimeoutRef | null = null;
  private _originalFetch: typeof fetch | null = null;
  private _patchedFetch: typeof fetch | null = null;
  private _originalXHROpen: XMLHttpRequest['open'] | null = null;
  private _patchedXHROpen: XMLHttpRequest['open'] | null = null;
  private _originalXHRSend: XMLHttpRequest['send'] | null = null;
  private _patchedXHRSend: XMLHttpRequest['send'] | null = null;

  public constructor({
    diag,
    perf,
    applyCustomAttributesOnLog,
    ignoreUrls = [],
    pageManager,
  }: PageLoadInstrumentationArgs = {}) {
    super({
      instrumentationName: 'PageLoadInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._pageManager = pageManager ?? page.getPageManager();
    // Resolved like the request URLs they are compared against, so a string
    // matches however that URL was written.
    this._ignoreUrls = ignoreUrls.map((url) =>
      typeof url === 'string' ? resolveUrl(url) : url,
    );
    this._applyCustomAttributesOnLog = applyCustomAttributesOnLog;
    this._mutationObserver = new MutationObserver(() => {
      this._onActivity();
    });
  }

  public override onEnable(): void {
    this._patchFetch();
    this._patchXHR();

    this._pageId = this._pageManager.getCurrentPageId();
    this._removeRouteChangedListener =
      this._pageManager.addRouteChangedListener(this._onRouteChanged);

    // The hard navigation loads once, so a re-enable does not measure it again.
    if (this._initialViewStarted) {
      return;
    }
    this._initialViewStarted = true;

    const loadEnd = this._getLoadEventEnd();
    if (loadEnd === null) {
      if (document.readyState === 'complete') {
        // Inside the load event: loadEventEnd is recorded once it returns.
        this._loadTimer = setTimeout(this._onLoadEventEnd, 0);
      } else {
        window.addEventListener('load', this._onLoad, { once: true });
      }
    }

    this._startView({
      type: 'initial_load',
      startTime: this.perf.epochMillisFromOrigin(0),
      loadEnd,
      settledAt: null,
    });
  }

  public override onDisable(): void {
    window.removeEventListener('load', this._onLoad);
    if (this._loadTimer !== null) {
      clearTimeout(this._loadTimer);
      this._loadTimer = null;
    }
    this._removeRouteChangedListener?.();
    this._removeRouteChangedListener = null;
    this._endView();
    this._unpatchFetch();
    this._unpatchXHR();
  }

  private readonly _onRouteChanged = (): void => {
    const pageId = this._pageManager.getCurrentPageId();
    // The same page reported again: its templated path resolved, or only the
    // query string or hash changed.
    if (pageId === this._pageId) {
      return;
    }
    this._pageId = pageId;

    const startTime = this.perf.getNowMillis();
    this._startView({
      type: 'route_change',
      startTime,
      loadEnd: startTime,
      settledAt: null,
    });
  };

  private readonly _onLoad = (): void => {
    // loadEventEnd is recorded once every load listener has returned.
    this._loadTimer = setTimeout(this._onLoadEventEnd, 0);
  };

  private readonly _onLoadEventEnd = (): void => {
    this._loadTimer = null;
    const view = this._view;
    if (view?.type !== 'initial_load') {
      return;
    }

    view.loadEnd = this._getLoadEventEnd() ?? this.perf.getNowMillis();
    this._tryFinalize(view);
  };

  private _getLoadEventEnd(): number | null {
    const navigation = this.perf.getNavigationEntry();
    if (navigation) {
      return navigation.loadEventEnd > 0
        ? this.perf.epochMillisFromOrigin(navigation.loadEventEnd)
        : null;
    }

    // WebKit gives about:blank and srcdoc documents no navigation entry at all,
    // so the time the load is first seen as finished stands in for it.
    return document.readyState === 'complete' ? this.perf.getNowMillis() : null;
  }

  private _startView(view: PageView): void {
    this._view = view;
    this._observeActivity();
    // Arms the quiet window from the view start, so a page with no activity
    // at all still finishes loading.
    this._onActivity();
  }

  private _endView(): void {
    this._view = null;
    this._clearQuietTimer();
    this._disconnectActivityObservers();
  }

  private readonly _onActivity = (): void => {
    const view = this._view;
    if (!view) {
      return;
    }

    this._clearQuietTimer();
    view.settledAt = null;
    if (this._inFlight > 0) {
      return;
    }

    // Read now rather than when the timer fires, which a background tab can
    // throttle by seconds.
    const quietSince = this.perf.getNowMillis();
    this._quietTimer = setTimeout(() => {
      this._quietTimer = null;
      view.settledAt = quietSince;
      this._tryFinalize(view);
    }, PAGE_LOAD_QUIET_WINDOW_MS);
  };

  private _clearQuietTimer(): void {
    if (this._quietTimer !== null) {
      clearTimeout(this._quietTimer);
      this._quietTimer = null;
    }
  }

  private _tryFinalize(view: PageView): void {
    if (
      view !== this._view ||
      view.settledAt === null ||
      view.loadEnd === null
    ) {
      return;
    }

    this._endView();

    try {
      const endTime = Math.max(view.settledAt, view.loadEnd);
      // A prerendered page is only seen from activation, which can come after
      // its view started.
      // eslint-disable-next-line baseline-js/use-baseline -- only prerendered pages have a nonzero value, and prerendering only exists where this is supported
      const activationStart = this.perf.getNavigationEntry()?.activationStart;
      const startTime = Math.max(
        view.startTime,
        this.perf.epochMillisFromOrigin(activationStart ?? 0),
      );

      this._emit(
        { type: view.type, duration: Math.max(0, endTime - startTime) },
        endTime,
      );
    } catch (e) {
      this._diag.error('failed to emit page-load log', e);
    }
  }

  private _emit(pageLoad: PageLoad, endTime: number): void {
    const attributes: Attributes = {
      ...this._getCustomAttributes(pageLoad),
      [KEY_EMB_TYPE]: EMB_TYPES.OTelLog,
      [ATTR_PAGE_LOAD_TYPE]: pageLoad.type,
      [ATTR_PAGE_LOAD_DURATION]: pageLoad.duration,
    };

    this.logger.emit({
      timestamp: millisToHrTime(endTime),
      eventName: PAGE_LOAD_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes,
    });
  }

  private _getCustomAttributes(pageLoad: PageLoad): Attributes | undefined {
    const applyCustomAttributesOnLog = this._applyCustomAttributesOnLog;
    if (!applyCustomAttributesOnLog) {
      return undefined;
    }

    return safeExecuteInTheMiddle(
      () => applyCustomAttributesOnLog(pageLoad),
      (error) => {
        if (error) {
          this._diag.error('applyCustomAttributesOnLog hook failed', error);
        }
      },
      true,
    );
  }

  // Connected only while a view is loading, so a loaded page pays nothing for
  // its later mutations.
  private _observeActivity(): void {
    if (this._observing) {
      return;
    }
    this._observing = true;

    // Typed non-nullable, but a document whose root element was removed has none.
    const root: Element | null = document.documentElement;
    if (root) {
      this._mutationObserver.observe(root, { childList: true, subtree: true });
    }

    this._resourceObserver =
      createPerformanceObserver<PerformanceResourceTiming>(
        'resource',
        (entry) => {
          // The request tracking owns these, and leaves out ignored URLs and
          // the SDK's own requests, which a resource entry cannot tell apart.
          if (
            entry.initiatorType !== 'fetch' &&
            entry.initiatorType !== 'xmlhttprequest'
          ) {
            this._onActivity();
          }
        },
        { buffered: false, diag: this._diag },
      );
  }

  private _disconnectActivityObservers(): void {
    this._mutationObserver.disconnect();
    this._resourceObserver?.disconnect();
    this._resourceObserver = null;
    this._observing = false;
  }

  // Returns the callback that ends the request, or null when it is not tracked.
  private readonly _trackRequest = (
    url: string | undefined,
  ): (() => void) | null => {
    try {
      if (
        !this._isEnabled ||
        (url !== undefined && isUrlIgnored(resolveUrl(url), this._ignoreUrls))
      ) {
        return null;
      }

      this._inFlight++;
      this._onActivity();

      // Firefox and WebKit fire loadend before a failed synchronous XHR send
      // throws, so that request reports its end twice.
      let ended = false;
      return () => {
        if (ended) {
          return;
        }
        ended = true;
        this._inFlight--;
        this._onActivity();
      };
    } catch (e) {
      this._diag.error('failed to track a page-load request', e);
      return null;
    }
  };

  /*
   * A patch stays in place when another wrapper went on top of it, since
   * restoring the original would drop that wrapper too. It stops counting
   * while disabled, and a later enable reuses it rather than wrap twice.
   */
  private _patchFetch(): void {
    if (this._patchedFetch || typeof window.fetch !== 'function') {
      return;
    }

    const originalFetch = window.fetch;
    const trackRequest = this._trackRequest;
    this._originalFetch = originalFetch;
    this._patchedFetch = function (
      this: unknown,
      ...args: Parameters<typeof fetch>
    ): Promise<Response> {
      const [input] = args;
      const endRequest = trackRequest(
        input instanceof Request ? input.url : String(input),
      );

      let response: Promise<Response>;
      try {
        response = originalFetch.apply(this, args);
      } catch (e) {
        endRequest?.();
        throw e;
      }

      if (endRequest) {
        // A side chain, so the caller still gets the original promise and
        // handles its rejection.
        void response.then(endRequest, endRequest);
      }

      return response;
    };
    window.fetch = this._patchedFetch;
  }

  private _unpatchFetch(): void {
    if (this._originalFetch && window.fetch === this._patchedFetch) {
      window.fetch = this._originalFetch;
      this._originalFetch = null;
      this._patchedFetch = null;
    }
  }

  private _patchXHR(): void {
    if (typeof XMLHttpRequest === 'undefined') {
      return;
    }

    const prototype = XMLHttpRequest.prototype;
    const xhrRequests = this._xhrRequests;

    if (!this._patchedXHROpen) {
      const originalOpen = prototype.open;
      this._originalXHROpen = originalOpen;
      this._patchedXHROpen = function (
        this: XMLHttpRequest,
        ...args: [method: string, url: string | URL, ...rest: unknown[]]
      ): void {
        // An open that throws leaves the previous request running untouched.
        (originalOpen as (...openArgs: unknown[]) => void).apply(this, args);
        // Reopening cancels a request in flight without firing loadend.
        xhrRequests.get(this)?.end?.();
        xhrRequests.set(this, { url: String(args[1]) });
      } as XMLHttpRequest['open'];
      prototype.open = this._patchedXHROpen;
    }

    if (!this._patchedXHRSend) {
      const originalSend = prototype.send;
      const trackRequest = this._trackRequest;
      this._originalXHRSend = originalSend;
      this._patchedXHRSend = function (
        this: XMLHttpRequest,
        ...args: Parameters<XMLHttpRequest['send']>
      ): void {
        const request = xhrRequests.get(this) ?? {};
        // Already in flight: the native send throws without affecting it.
        if (request.end) {
          originalSend.apply(this, args);
          return;
        }

        const endRequest = trackRequest(request.url);
        if (!endRequest) {
          originalSend.apply(this, args);
          return;
        }

        const end = (): void => {
          this.removeEventListener('loadend', end);
          endRequest();
          xhrRequests.delete(this);
        };
        request.end = end;
        xhrRequests.set(this, request);
        // Added before sending: a synchronous request fires loadend inside send.
        this.addEventListener('loadend', end);

        try {
          originalSend.apply(this, args);
        } catch (e) {
          end();
          throw e;
        }
      };
      prototype.send = this._patchedXHRSend;
    }
  }

  private _unpatchXHR(): void {
    if (typeof XMLHttpRequest === 'undefined') {
      return;
    }

    const prototype = XMLHttpRequest.prototype;

    if (this._originalXHROpen && prototype.open === this._patchedXHROpen) {
      prototype.open = this._originalXHROpen;
      this._originalXHROpen = null;
      this._patchedXHROpen = null;
    }

    if (this._originalXHRSend && prototype.send === this._patchedXHRSend) {
      prototype.send = this._originalXHRSend;
      this._originalXHRSend = null;
      this._patchedXHRSend = null;
    }
  }
}
