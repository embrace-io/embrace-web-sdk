import type { Span } from '@opentelemetry/api';
import type { PageManager, Route } from '../../../api-page/index.ts';
import { page } from '../../../api-page/index.ts';
import type { SessionPartStartedEvent } from '../../../api-sessions/index.ts';
import {
  EMB_TYPES,
  KEY_EMB_PAGE_ID,
  KEY_EMB_PAGE_PATH,
  KEY_EMB_TYPE,
} from '../../../constants/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { NavigationInstrumentationArgs } from './types.ts';

// Regular expression to match path options in the format "(option)"
// Used to clean up paths that are like "/order/:orderState(pending|shipped|delivered)/type:(sale|normal)" to "/order/:orderState/:type"
// Could be simplified but done this way to prevent: https://javascript.info/regexp-catastrophic-backtracking
const PATH_OPTIONS_RE = /\([^()]+\)/g;

export class NavigationInstrumentation extends EmbraceInstrumentationBase {
  private readonly _shouldCleanupPathOptionsFromRouteName: boolean = true;
  private readonly _pageManager: PageManager;
  private _currentRouteSpan: Span | null = null;
  private _currentRouteSpanUrl: string | null = null;
  private _currentRouteSpanPath: string | null = null;

  public constructor({
    diag,
    shouldCleanupPathOptionsFromRouteName = true,
    pageManager,
  }: NavigationInstrumentationArgs) {
    super({
      instrumentationName: 'NavigationInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      config: {},
    });

    this._shouldCleanupPathOptionsFromRouteName =
      shouldCleanupPathOptionsFromRouteName;
    this._pageManager = pageManager ?? page.getPageManager();
    this._pageManager.addRouteChangedListener(this._onRouteChanged);
  }

  private readonly _onRouteChanged = (route: Route): void => {
    if (!this._isEnabled) {
      return;
    }

    if (this._currentRouteSpan && this._currentRouteSpanUrl === route.url) {
      // Same url as the currently open span: either the templated path just
      // resolved (rename in place), or a redundant re-render — no-op if the
      // path hasn't actually changed.
      if (this._currentRouteSpanPath !== route.path) {
        this._renameCurrentRouteSpan(route.path);
      }
      return;
    }

    this._endRouteSpan();
    this._startRouteSpan(route);
  };

  private readonly _startRouteSpan = (route: Route): Span => {
    this._diag.debug(`Starting route span for url: ${route.url}`);

    const pathName = this._cleanPath(route.path);
    this._currentRouteSpan = this.tracer.startSpan(pathName, {
      startTime: this.perf.getNowMillis(),
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.Surface,
        [KEY_EMB_PAGE_PATH]: pathName,
        [KEY_EMB_PAGE_ID]: this._pageManager.getCurrentPageId() || undefined,
      },
    });
    this._currentRouteSpanUrl = route.url;
    this._currentRouteSpanPath = route.path;

    return this._currentRouteSpan;
  };

  private readonly _endRouteSpan = (): void => {
    if (this._currentRouteSpan) {
      this._diag.debug(
        `Ending route span for url: ${this._currentRouteSpanUrl ?? 'unknown'}`,
      );

      this._currentRouteSpan.end(this.perf.getNowMillis());
      this._currentRouteSpan = null;
      this._currentRouteSpanUrl = null;
      this._currentRouteSpanPath = null;
    }
  };

  private readonly _renameCurrentRouteSpan = (path: string): void => {
    const pathName = this._cleanPath(path);
    this._diag.debug(`Resolved route span path to: ${pathName}`);

    this._currentRouteSpan?.updateName(pathName);
    this._currentRouteSpan?.setAttribute(KEY_EMB_PAGE_PATH, pathName);
    this._currentRouteSpanPath = path;
  };

  private readonly _cleanPath = (path: string): string =>
    this._shouldCleanupPathOptionsFromRouteName
      ? path.replace(PATH_OPTIONS_RE, '')
      : path;

  // A route span must not outlive the session part it started in — e.g. the
  // tab backgrounds, or the session ends, with no further navigation to
  // trigger _onRouteChanged.
  private readonly _onSessionPartEnded = (): void => {
    if (this._currentRouteSpan) {
      this._diag.debug('Session ended, ending route span.');
      this._endRouteSpan();
    }
  };

  // Only needed when a session part starts with no route change (e.g.
  // resuming after background/inactivity). Skipped for soft-nav rollovers,
  // since the real new route is reported right after (see
  // EmbracePageManager._onSoftNavigation).
  private readonly _onSessionPartStarted = ({
    reason,
  }: SessionPartStartedEvent): void => {
    if (reason === 'web_soft_navigation') {
      return;
    }

    const currentRoute = this._pageManager.getCurrentRoute();
    if (currentRoute) {
      this._onRouteChanged(currentRoute);
    }
  };

  public override onEnable = () => {
    this.setSessionPartListeners({
      start: this._onSessionPartStarted,
      end: this._onSessionPartEnded,
    });

    // Route changes while disabled are dropped by the _isEnabled guard, so a
    // route set before enabling is replayed here to open its span.
    const currentRoute = this._pageManager.getCurrentRoute();
    if (currentRoute) {
      this._onRouteChanged(currentRoute);
    }

    this._diag.debug(
      'NavigationInstrumentation enabled, listening for navigation events.',
    );
  };

  public override onDisable = () => {
    this._endRouteSpan();
    this._diag.debug(
      'NavigationInstrumentation disabled, stopped listening for navigation events.',
    );
  };
}
