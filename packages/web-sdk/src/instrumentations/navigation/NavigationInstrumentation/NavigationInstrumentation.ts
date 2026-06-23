import type { Span } from '@opentelemetry/api';
import type { Route } from '../../../api-page/index.ts';
import { page } from '../../../api-page/index.ts';
import {
  EMB_NAVIGATION_INSTRUMENTATIONS,
  EMB_TYPES,
  KEY_EMB_INSTRUMENTATION,
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
  private _currentRouteSpan: Span | null = null;
  private _instrumentationType: EMB_NAVIGATION_INSTRUMENTATIONS =
    EMB_NAVIGATION_INSTRUMENTATIONS.Manual;
  private _removeSessionPartStartedFn: (() => void) | null = null;
  private _removeSessionPartEndedFn: (() => void) | null = null;

  public constructor({
    diag,
    shouldCleanupPathOptionsFromRouteName = true,
  }: NavigationInstrumentationArgs) {
    super({
      instrumentationName: 'NavigationInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      config: {},
    });

    this._shouldCleanupPathOptionsFromRouteName =
      shouldCleanupPathOptionsFromRouteName;

    if (this._config.enabled) {
      this.enable();
    }
  }

  public setInstrumentationType = (
    instrumentationType: EMB_NAVIGATION_INSTRUMENTATIONS,
  ) => {
    this._instrumentationType = instrumentationType;
  };

  public setCurrentRoute = (route: Route) => {
    if (!this._config.enabled) {
      return;
    }

    const currentRoute = page.getCurrentRoute();

    if (route.url !== currentRoute?.url) {
      page.setCurrentRoute(route);

      this._endRouteSpan(currentRoute);
      this._startRouteSpan(route);
    }
  };

  private readonly _setupSessionPartListeners = () => {
    if (!this._removeSessionPartStartedFn) {
      this._removeSessionPartStartedFn =
        this.userSessionManager.addSessionPartStartedListener(() => {
          const currentRoute = page.getCurrentRoute();

          if (currentRoute && !this._currentRouteSpan) {
            this._diag.debug('Session started, starting route span.');

            this._startRouteSpan(currentRoute);
          }
        });
    }

    if (!this._removeSessionPartEndedFn) {
      this._removeSessionPartEndedFn =
        this.userSessionManager.addSessionPartEndedListener(() => {
          if (this._currentRouteSpan) {
            this._diag.debug('Session ended, ending route span.');

            this._endRouteSpan(page.getCurrentRoute());
          }
        });
    }
  };

  private readonly _cleanUpSessionPartListeners = () => {
    if (this._removeSessionPartStartedFn) {
      this._removeSessionPartStartedFn();
      this._removeSessionPartStartedFn = null;
    }

    if (this._removeSessionPartEndedFn) {
      this._removeSessionPartEndedFn();
      this._removeSessionPartEndedFn = null;
    }
  };

  private readonly _startRouteSpan = (route: Route): Span => {
    this._diag.debug(`Starting route span for url: ${route.url}`);
    this._setupSessionPartListeners();

    const pathName = this._shouldCleanupPathOptionsFromRouteName
      ? route.path.replace(PATH_OPTIONS_RE, '')
      : route.path;
    this._currentRouteSpan = this.tracer.startSpan(pathName, {
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.Surface,
        [KEY_EMB_PAGE_PATH]: pathName,
        [KEY_EMB_PAGE_ID]: page.getCurrentPageId() || undefined,
      },
    });

    this._currentRouteSpan.setAttribute(
      KEY_EMB_INSTRUMENTATION,
      this._instrumentationType,
    );

    return this._currentRouteSpan;
  };

  private readonly _endRouteSpan = (currentRoute: Route | null) => {
    if (this._currentRouteSpan) {
      if (currentRoute) {
        this._diag.debug(`Ending route span for url: ${currentRoute.url}`);
      }

      this._currentRouteSpan.end();
      this._currentRouteSpan = null;
    }
  };

  public override onEnable = () => {
    this.setConfig({
      enabled: true,
    });
    this._diag.debug(
      'NavigationInstrumentation enabled, listening for navigation events.',
    );
  };

  public override onDisable = () => {
    this._cleanUpSessionPartListeners();
    this.setConfig({
      enabled: false,
    });
    this._diag.debug(
      'NavigationInstrumentation disabled, stopped listening for navigation events.',
    );
  };
}
