import type { Attributes } from '@opentelemetry/api';
import type { Route } from '../../../api-page/index.ts';
import { page } from '../../../api-page/index.ts';
import {
  EMB_NAVIGATION_INSTRUMENTATIONS,
  EMB_TYPES,
  KEY_EMB_INSTRUMENTATION,
  KEY_EMB_NAVIGATION_CONFIDENCE,
  KEY_EMB_NAVIGATION_DETECTION_SOURCE,
  KEY_EMB_NAVIGATION_DOM_SCORE,
  KEY_EMB_NAVIGATION_INTERACTION_LATENCY_MS,
  KEY_EMB_NAVIGATION_INTERACTION_TYPE,
  KEY_EMB_NAVIGATION_NETWORK_REQUESTS,
  KEY_EMB_NAVIGATION_SCROLL_RESET,
  KEY_EMB_NAVIGATION_TITLE_CHANGED,
  KEY_EMB_NAVIGATION_TYPE,
  KEY_EMB_PAGE_PATH,
  KEY_EMB_REFERRER_URL,
  KEY_EMB_TYPE,
} from '../../../constants/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  meetsMinimumConfidence,
  NavigationValidator,
} from './NavigationValidator.ts';
import { observeNavigations } from './observeNavigations.ts';
import type {
  BrowserNavigationInstrumentationConfig,
  Cleanup,
  Confidence,
  NavigationEvent,
  NavigationValidation,
} from './types.ts';

const SPA_SOURCES = new Set([
  'navigation_api',
  'history_patch',
  'popstate',
  'hashchange',
]);

export class BrowserNavigationInstrumentation extends EmbraceInstrumentationBase {
  private _cleanup: Cleanup | null = null;
  private _routeMatcher?: (url: string) => string;
  private _emitHardNavigations: boolean;
  private _enableHeuristicValidation: boolean;
  private _minimumConfidence: Confidence;
  private _allowWithoutInteraction: boolean;
  private _validator: NavigationValidator | null = null;
  private _pendingEvent: { route: Route; event: NavigationEvent } | null = null;

  public constructor({
    diag,
    routeMatcher,
    emitHardNavigations,
    enableHeuristicValidation,
    interactionWindow,
    domSettleDelay,
    maxSettleDelay,
    domScoreThreshold,
    allowWithoutInteraction,
    minimumConfidence,
    ...rest
  }: BrowserNavigationInstrumentationConfig = {}) {
    super({
      instrumentationName: 'BrowserNavigationInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      config: rest,
    });

    this._routeMatcher = routeMatcher;
    this._emitHardNavigations = emitHardNavigations ?? false;
    this._enableHeuristicValidation = enableHeuristicValidation ?? false;
    this._minimumConfidence = minimumConfidence ?? 'medium';
    this._allowWithoutInteraction = allowWithoutInteraction ?? false;

    if (this._enableHeuristicValidation) {
      this._validator = new NavigationValidator({
        diag: this._diag,
        interactionWindow: interactionWindow ?? 5000,
        domSettleDelay: domSettleDelay ?? 200,
        maxSettleDelay: maxSettleDelay ?? 3000,
        domScoreThreshold: domScoreThreshold ?? 15,
      });
    }

    if (this._config.enabled) {
      this.enable();
    }
  }

  private readonly _resolveRoute = (url: string): Route => {
    if (this._routeMatcher) {
      try {
        const path = this._routeMatcher(url);
        return { path, url };
      } catch (e) {
        this._diag.error(
          `routeMatcher threw for url=${url}, falling back to pathname`,
          e,
        );
      }
    }

    try {
      const path = new URL(url, location.href).pathname;
      return { path, url };
    } catch (e) {
      this._diag.error(`Failed to parse URL: ${url}`, e);
      return { path: url, url };
    }
  };

  private readonly _handleNavigation = (event: NavigationEvent): void => {
    if (!this._config.enabled) {
      return;
    }

    try {
      const route = this._resolveRoute(event.url);
      const currentRoute = page.getCurrentRoute();

      if (route.url !== currentRoute?.url) {
        this._diag.debug(
          `Navigation detected: type=${event.type}, source=${event.source}, url=${route.url}`,
        );
        page.setCurrentRoute(route);

        const isSpaSource = SPA_SOURCES.has(event.source);

        if (this._enableHeuristicValidation && this._validator && isSpaSource) {
          if (this._pendingEvent) {
            this._finalizePending();
          }

          this._pendingEvent = { route, event };
          this._validator.beginValidation(event.timestamp);
        } else {
          this._emitNavigationLog(route, event);
        }
      } else {
        this._diag.debug(
          `Navigation skipped (same URL): source=${event.source}, url=${route.url}`,
        );
      }
    } catch (e) {
      this._diag.error('Error handling navigation event', e);
    }
  };

  private _finalizePending(): void {
    if (!this._pendingEvent || !this._validator) {
      return;
    }

    const validation = this._validator.getValidation();
    this._validator.cancelValidation();
    const { route, event } = this._pendingEvent;
    this._pendingEvent = null;

    this._emitNavigationLog(route, event, validation ?? undefined);
  }

  private readonly _onValidationSettled = (
    validation: NavigationValidation,
  ): void => {
    if (!this._pendingEvent) {
      return;
    }

    const { route, event } = this._pendingEvent;
    this._pendingEvent = null;

    if (
      !this._allowWithoutInteraction &&
      validation.interactionType === null &&
      validation.confidence !== 'very-high' &&
      validation.confidence !== 'high'
    ) {
      this._diag.debug(
        `Navigation discarded (no interaction): url=${route.url}, confidence=${validation.confidence}`,
      );
      return;
    }

    if (
      !meetsMinimumConfidence(validation.confidence, this._minimumConfidence)
    ) {
      this._diag.debug(
        `Navigation discarded (low confidence): url=${route.url}, confidence=${validation.confidence}, minimum=${this._minimumConfidence}`,
      );
      return;
    }

    this._emitNavigationLog(route, event, validation);
  };

  private readonly _emitNavigationLog = (
    route: Route,
    event: NavigationEvent,
    validation?: NavigationValidation,
  ): void => {
    const attributes: Attributes = {
      [KEY_EMB_TYPE]: EMB_TYPES.Navigation,
      [KEY_EMB_INSTRUMENTATION]: EMB_NAVIGATION_INSTRUMENTATIONS.Browser,
      [KEY_EMB_NAVIGATION_TYPE]: event.type,
      [KEY_EMB_NAVIGATION_DETECTION_SOURCE]: event.source,
      [KEY_EMB_REFERRER_URL]: event.previousUrl,
      [KEY_EMB_PAGE_PATH]: route.path,
    };

    if (validation) {
      attributes[KEY_EMB_NAVIGATION_CONFIDENCE] = validation.confidence;
      attributes[KEY_EMB_NAVIGATION_DOM_SCORE] = String(validation.domScore);
      attributes[KEY_EMB_NAVIGATION_TITLE_CHANGED] = String(
        validation.titleChanged,
      );
      if (validation.interactionType !== null) {
        attributes[KEY_EMB_NAVIGATION_INTERACTION_TYPE] =
          validation.interactionType;
      }
      if (validation.interactionLatencyMs !== null) {
        attributes[KEY_EMB_NAVIGATION_INTERACTION_LATENCY_MS] = String(
          validation.interactionLatencyMs,
        );
      }
      attributes[KEY_EMB_NAVIGATION_NETWORK_REQUESTS] = String(
        validation.networkRequests,
      );
      attributes[KEY_EMB_NAVIGATION_SCROLL_RESET] = String(
        validation.scrollReset,
      );
    }

    this.logManager.message('navigation', 'info', { attributes });
  };

  public enable = () => {
    if (this._cleanup) {
      this._cleanup();
    }

    this.setConfig({
      ...this._config,
      enabled: true,
    });
    this._diag.debug('enabled, listening for navigation events.');

    if (this._validator) {
      this._validator.onSettled(this._onValidationSettled);
      this._validator.start();
    }

    this._cleanup = observeNavigations(this._handleNavigation, this._diag, {
      emitHardNavigations: this._emitHardNavigations,
    });
  };

  public disable = () => {
    this._pendingEvent = null;
    if (this._validator) {
      this._validator.stop();
    }

    if (this._cleanup) {
      this._cleanup();
      this._cleanup = null;
    }

    this.setConfig({
      ...this._config,
      enabled: false,
    });
    this._diag.debug('disabled, stopped listening for navigation events.');
  };
}
