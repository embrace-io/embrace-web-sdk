import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { PageManager, Route } from '../../api-page/index.ts';
import type { NavigationHost, TitleDocument } from '../../common/index.ts';
import { generateUUID } from '../../utils/index.ts';
import type { UserSessionManagerInternal } from '../EmbraceUserSessionManager/index.ts';
import type { EmbracePageManagerArgs } from './types.ts';

export class EmbracePageManager implements PageManager {
  private _currentRoute: Route | null = null;
  private _currentPageId: string | null = null;
  private _pageLabel: string | null = null;
  private readonly _titleDocument: TitleDocument | undefined;
  private readonly _useDocumentTitleAsPageLabel: boolean;
  private readonly _routeChangedListeners: Array<(route: Route) => void> = [];
  private readonly _diag: DiagLogger;
  private readonly _navigationHost: NavigationHost;
  private readonly _userSessionManager: UserSessionManagerInternal | undefined;

  public constructor({
    useDocumentTitleAsPageLabel = true,
    titleDocument = window.document,
    diag: diagParam,
    navigationHost = window as NavigationHost,
    userSessionManager,
  }: EmbracePageManagerArgs = {}) {
    this._useDocumentTitleAsPageLabel = useDocumentTitleAsPageLabel;
    this._titleDocument = titleDocument;
    this._diag =
      diagParam ??
      diag.createComponentLogger({ namespace: 'EmbracePageManager' });
    this._navigationHost = navigationHost;
    this._userSessionManager = userSessionManager;

    this._navigationHost.navigation?.addEventListener(
      'currententrychange',
      this._onSoftNavigation,
    );

    this._setInitialRouteFromCurrentLocation();
  }

  public getCurrentPageId = (): string | null => this._currentPageId;

  public getCurrentRoute = () => this._currentRoute;

  public setPageLabel = (label: string): void => {
    this._pageLabel = label;
  };

  public getPageLabel = (): string | null => {
    return (
      this._pageLabel ||
      (!this._useDocumentTitleAsPageLabel || !this._titleDocument
        ? null
        : this._titleDocument.title)
    );
  };

  public setCurrentRoute = (route: Route) => {
    if (!this._currentRoute || this._currentRoute.url !== route.url) {
      this._currentPageId = generateUUID();
    }

    this._currentRoute = route;

    if (route.label) {
      this._pageLabel = route.label;
    } else {
      this._pageLabel = null;
    }

    for (const listener of this._routeChangedListeners) {
      try {
        listener(route);
      } catch (error) {
        this._diag.warn('Error while executing route changed listener', error);
      }
    }
  };

  public clearCurrentRoute = () => {
    this._currentRoute = null;
    this._currentPageId = null;
    this._pageLabel = null;
  };

  public addRouteChangedListener = (
    listener: (route: Route) => void,
  ): (() => void) => {
    this._routeChangedListeners.push(listener);

    return () => {
      const index = this._routeChangedListeners.indexOf(listener);
      if (index !== -1) {
        this._routeChangedListeners.splice(index, 1);
      }
    };
  };

  private readonly _onSoftNavigation = (
    event: NavigationCurrentEntryChangeEvent,
  ): void => {
    // Skip same-URL replacements (e.g. framework hydration via history.replaceState).
    // eslint-disable-next-line baseline-js/use-baseline
    if (event.from.url === this._navigationHost.location.href) {
      return;
    }

    // Rolling over the session part before setting the new route matters:
    // NavigationInstrumentation ends its route span from the session-part-
    // ended listener, which EmbraceUserSessionManager fires before the
    // outgoing session-part span itself ends — so the route span is already
    // queued by the time EmbraceSessionPartBatchedSpanProcessor flushes the
    // old part's batch. Setting the new route first would end the outgoing
    // route span too late (after that flush) and start the new route span
    // before the rollover, so the session-part-ended listener would
    // incorrectly close the new span instead of the outgoing one.
    this._userSessionManager?.rolloverSessionPartInternal({
      endReason: 'web_soft_navigation',
      startReason: 'web_soft_navigation',
    });

    this._setInitialRouteFromCurrentLocation();
  };

  private readonly _setInitialRouteFromCurrentLocation = (): void => {
    const pathname = this._navigationHost.location.pathname;
    this.setCurrentRoute({ path: pathname, url: pathname });
  };
}
