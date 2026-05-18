import type { DiagLogger } from '@opentelemetry/api';
import type {
  Confidence,
  InteractionType,
  NavigationValidation,
} from './types.ts';
import { INTERACTION_EVENTS } from './types.ts';

const CONFIDENCE_ORDER = [
  'low',
  'medium',
  'medium-high',
  'high',
  'very-high',
] as const satisfies readonly Confidence[];

export const meetsMinimumConfidence = (
  confidence: Confidence,
  minimum: Confidence,
): boolean => {
  return (
    CONFIDENCE_ORDER.indexOf(confidence) >= CONFIDENCE_ORDER.indexOf(minimum)
  );
};

interface NavigationValidatorConfig {
  diag: DiagLogger;
  interactionWindow: number;
  domSettleDelay: number;
  maxSettleDelay: number;
  domScoreThreshold: number;
}

interface PendingValidation {
  timestamp: number;
  domScore: number;
  titleChanged: boolean;
  interactionType: InteractionType | null;
  interactionTimestamp: number | null;
  networkRequests: number;
  scrollReset: boolean;
  settleTimer: ReturnType<typeof setTimeout> | null;
  maxSettleTimer: ReturnType<typeof setTimeout> | null;
}

type SettledCallback = (validation: NavigationValidation) => void;

const DOM_NODE_SCORES: Record<string, number> = {
  DIV: 1,
  SPAN: 1,
  P: 2,
  H1: 3,
  H2: 3,
  H3: 3,
  H4: 2,
  H5: 2,
  H6: 2,
  LI: 2,
  TR: 2,
  TD: 1,
  TH: 1,
  A: 2,
  IMG: 3,
  SECTION: 2,
  ARTICLE: 3,
  NAV: 2,
  MAIN: 3,
  HEADER: 2,
  FOOTER: 2,
  FORM: 3,
  INPUT: 2,
  BUTTON: 2,
  UL: 1,
  OL: 1,
  TABLE: 2,
};

const DEFAULT_NODE_SCORE = 1;

export class NavigationValidator {
  private readonly _config: NavigationValidatorConfig;
  private _pending: PendingValidation | null = null;
  private _settledCallback: SettledCallback | null = null;
  private _domObserver: MutationObserver | null = null;
  private _titleObserver: MutationObserver | null = null;
  private _networkObserver: PerformanceObserver | null = null;
  private _lastInteraction: {
    type: InteractionType;
    timestamp: number;
  } | null = null;
  private readonly _cleanupFns: Array<() => void> = [];
  private readonly _validationCleanups: Array<() => void> = [];
  private _started = false;

  constructor(config: NavigationValidatorConfig) {
    this._config = config;
  }

  start(): void {
    if (this._started) {
      return;
    }
    this._started = true;
    this._setupInteractionListeners();
  }

  stop(): void {
    if (!this._started) {
      return;
    }
    this._started = false;

    if (this._pending) {
      this._finalize();
    }

    this._teardownObservers();

    for (const cleanup of this._cleanupFns) {
      try {
        cleanup();
      } catch (e) {
        this._config.diag.error('Error during NavigationValidator cleanup', e);
      }
    }
    this._cleanupFns.length = 0;
    this._lastInteraction = null;
  }

  onSettled(callback: SettledCallback): void {
    this._settledCallback = callback;
  }

  beginValidation(timestamp: number): void {
    if (this._pending) {
      this._finalize();
    }

    this._pending = {
      timestamp,
      domScore: 0,
      titleChanged: false,
      interactionType: null,
      interactionTimestamp: null,
      networkRequests: 0,
      scrollReset: false,
      settleTimer: null,
      maxSettleTimer: null,
    };

    this._attributeInteraction(timestamp);
    this._setupDomObserver();
    this._setupTitleObserver();
    this._setupNetworkObserver();
    this._setupScrollListener();
    this._startSettleTimer();
    this._startMaxSettleTimer();
  }

  cancelValidation(): void {
    if (this._pending) {
      this._clearTimers();
      this._teardownObservers();
      this._pending = null;
    }
  }

  getValidation(): NavigationValidation | null {
    if (!this._pending) {
      return null;
    }
    return this._buildValidation(this._pending);
  }

  private _attributeInteraction(navigationTimestamp: number): void {
    if (!this._pending || !this._lastInteraction) {
      return;
    }

    const elapsed = navigationTimestamp - this._lastInteraction.timestamp;
    if (elapsed >= 0 && elapsed <= this._config.interactionWindow) {
      this._pending.interactionType = this._lastInteraction.type;
      this._pending.interactionTimestamp = this._lastInteraction.timestamp;
    }
  }

  private _setupInteractionListeners(): void {
    const handlers: Array<{
      type: InteractionType;
      handler: EventListener;
    }> = [];
    const options = { capture: true, passive: true };

    for (const eventType of INTERACTION_EVENTS) {
      const handler = () => {
        this._lastInteraction = { type: eventType, timestamp: Date.now() };
      };
      handlers.push({ type: eventType, handler });
      window.addEventListener(eventType, handler, options);
    }

    this._cleanupFns.push(() => {
      for (const { type, handler } of handlers) {
        window.removeEventListener(type, handler, options);
      }
    });
  }

  private _setupDomObserver(): void {
    if (typeof MutationObserver === 'undefined') {
      this._config.diag.debug(
        'NavigationValidator: MutationObserver not available, DOM scoring disabled',
      );
      return;
    }

    if (!document.body) {
      this._config.diag.debug(
        'NavigationValidator: document.body not available, DOM scoring disabled',
      );
      return;
    }

    this._domObserver = new MutationObserver((mutations) => {
      if (!this._pending) {
        return;
      }

      let batchScore = 0;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            batchScore += this._scoreElement(node as Element);
          }
        }
      }

      if (batchScore > 0) {
        this._pending.domScore += batchScore;
        this._resetSettleTimer();
      }
    });

    this._domObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private _scoreElement(element: Element): number {
    let score = DOM_NODE_SCORES[element.tagName] ?? DEFAULT_NODE_SCORE;
    const children = element.querySelectorAll('*');
    for (const child of children) {
      score += DOM_NODE_SCORES[child.tagName] ?? DEFAULT_NODE_SCORE;
    }
    return score;
  }

  private _setupTitleObserver(): void {
    if (typeof MutationObserver === 'undefined' || !document.head) {
      this._config.diag.debug(
        'NavigationValidator: MutationObserver or document.head not available, title observation disabled',
      );
      return;
    }

    const initialTitle = document.title;

    this._titleObserver = new MutationObserver(() => {
      if (this._pending && document.title !== initialTitle) {
        this._pending.titleChanged = true;
      }
    });

    this._titleObserver.observe(document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  private _setupNetworkObserver(): void {
    if (typeof PerformanceObserver === 'undefined') {
      return;
    }

    try {
      this._networkObserver = new PerformanceObserver((list) => {
        if (!this._pending) {
          return;
        }
        this._pending.networkRequests += list.getEntries().length;
      });

      this._networkObserver.observe({ type: 'resource', buffered: false });
    } catch (e) {
      this._config.diag.warn(
        'NavigationValidator: failed to set up resource PerformanceObserver',
        e,
      );
    }
  }

  private _setupScrollListener(): void {
    const handler = () => {
      if (this._pending && window.scrollY === 0) {
        this._pending.scrollReset = true;
      }
    };

    window.addEventListener('scroll', handler, { passive: true });
    this._validationCleanups.push(() => {
      window.removeEventListener('scroll', handler);
    });
  }

  private _teardownObservers(): void {
    if (this._domObserver) {
      this._domObserver.disconnect();
      this._domObserver = null;
    }
    if (this._titleObserver) {
      this._titleObserver.disconnect();
      this._titleObserver = null;
    }
    if (this._networkObserver) {
      this._networkObserver.disconnect();
      this._networkObserver = null;
    }
    for (const cleanup of this._validationCleanups) {
      try {
        cleanup();
      } catch (e) {
        this._config.diag.error('Error during observer cleanup', e);
      }
    }
    this._validationCleanups.length = 0;
  }

  private _startSettleTimer(): void {
    if (!this._pending) {
      return;
    }
    this._pending.settleTimer = setTimeout(() => {
      this._finalize();
    }, this._config.domSettleDelay);
  }

  private _resetSettleTimer(): void {
    if (!this._pending) {
      return;
    }
    if (this._pending.settleTimer !== null) {
      clearTimeout(this._pending.settleTimer);
    }
    this._pending.settleTimer = setTimeout(() => {
      this._finalize();
    }, this._config.domSettleDelay);
  }

  private _startMaxSettleTimer(): void {
    if (!this._pending) {
      return;
    }
    this._pending.maxSettleTimer = setTimeout(() => {
      this._config.diag.debug(
        'NavigationValidator: max settle timeout reached, finalizing',
      );
      this._finalize();
    }, this._config.maxSettleDelay);
  }

  private _clearTimers(): void {
    if (!this._pending) {
      return;
    }
    if (this._pending.settleTimer !== null) {
      clearTimeout(this._pending.settleTimer);
      this._pending.settleTimer = null;
    }
    if (this._pending.maxSettleTimer !== null) {
      clearTimeout(this._pending.maxSettleTimer);
      this._pending.maxSettleTimer = null;
    }
  }

  private _finalize(): void {
    if (!this._pending) {
      return;
    }

    const validation = this._buildValidation(this._pending);
    this._clearTimers();
    this._teardownObservers();
    this._pending = null;

    if (this._settledCallback) {
      try {
        this._settledCallback(validation);
      } catch (e) {
        this._config.diag.error(
          'Error in navigation validation settled callback',
          e,
        );
      }
    }
  }

  private _buildValidation(pending: PendingValidation): NavigationValidation {
    const confidence = this._computeConfidence(pending);

    return {
      confidence,
      domScore: pending.domScore,
      titleChanged: pending.titleChanged,
      interactionType: pending.interactionType,
      interactionLatencyMs:
        pending.interactionType !== null &&
        pending.interactionTimestamp !== null
          ? pending.timestamp - pending.interactionTimestamp
          : null,
      networkRequests: pending.networkRequests,
      scrollReset: pending.scrollReset,
    };
  }

  private _computeConfidence(pending: PendingValidation): Confidence {
    const domExceeded = pending.domScore >= this._config.domScoreThreshold;

    if (domExceeded && pending.titleChanged) {
      return 'very-high';
    }
    if (domExceeded) {
      return 'high';
    }
    if (pending.titleChanged) {
      return 'medium-high';
    }
    if (pending.interactionType !== null) {
      return 'medium';
    }
    return 'low';
  }
}
