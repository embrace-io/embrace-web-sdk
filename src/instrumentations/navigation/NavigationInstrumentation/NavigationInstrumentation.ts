import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import type { NavigationInstrumentationArgs, Route } from './types.js';
import type { Span } from '@opentelemetry/api';
import {
  EMB_TYPES,
  KEY_EMB_TYPE,
  KEY_VIEW_NAME,
} from '../../../constants/index.js';
import type { EMB_NAVIGATION_INSTRUMENTATIONS } from '../../../constants/index.js';
import { KEY_EMB_INSTRUMENTATION } from '../../../constants/index.js';

// Regular expression to match path options in the format "(option)"
// Used to clean up paths that are like "/order/:orderState(pending|shipped|delivered)" to "/order/:orderState"
const PATH_OPTIONS_RE = /\(.*?\)/g;

export class NavigationInstrumentation extends EmbraceInstrumentationBase {
  private readonly _shouldCleanupPathOptionsFromRouteName: boolean = true;
  private _currentRoute: Route | null = null;
  private _currentRouteSpan: Span | null = null;
  private _instrumentationType: EMB_NAVIGATION_INSTRUMENTATIONS | null = null;

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
    instrumentationType: EMB_NAVIGATION_INSTRUMENTATIONS
  ) => {
    this._instrumentationType = instrumentationType;
  };

  public setCurrentRoute = (route: Route) => {
    if (!this._config.enabled) {
      return;
    }

    if (route.url !== this._currentRoute?.url) {
      this._endRouteSpan();
      this._startRouteSpan(route);
      this._currentRoute = route;
    }
  };

  private readonly _startRouteSpan = (route: Route): Span => {
    this._diag.debug(`Starting route span for url: ${route.url}`);

    const pathName = this._shouldCleanupPathOptionsFromRouteName
      ? route.path.replace(PATH_OPTIONS_RE, '')
      : route.path;
    this._currentRouteSpan = this.tracer.startSpan(pathName, {
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.View,
        [KEY_VIEW_NAME]: pathName,
      },
    });

    if (this._instrumentationType) {
      this._currentRouteSpan.setAttribute(
        KEY_EMB_INSTRUMENTATION,
        this._instrumentationType
      );
    }

    return this._currentRouteSpan;
  };

  private readonly _endRouteSpan = () => {
    if (this._currentRouteSpan && this._currentRoute) {
      this._diag.debug(`Ending route span for url: ${this._currentRoute.url}`);
      this._currentRouteSpan.end();
      this._currentRouteSpan = null;
    }
  };

  public enable = () => {
    this._diag.debug(
      'NavigationInstrumentation enabled, listening for navigation events.'
    );
  };

  public disable = () => {
    this.setConfig({
      enabled: false,
    });
    this._diag.debug(
      'NavigationInstrumentation disabled, stopped listening for navigation events.'
    );
  };
}
