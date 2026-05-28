import { SeverityNumber } from '@opentelemetry/api-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/attributes.ts';
import { getSelector } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { FirstInteractionType } from './constants.ts';
import {
  ATTR_FIRST_INTERACTION_ELEMENT_SELECTOR,
  ATTR_FIRST_INTERACTION_ELEMENT_TYPE,
  ATTR_FIRST_INTERACTION_INTERACTION_TYPE,
  ATTR_FIRST_INTERACTION_X,
  ATTR_FIRST_INTERACTION_Y,
  FIRST_INTERACTION_EVENT_NAME,
} from './constants.ts';
import type { FirstInteractionInstrumentationArgs } from './types.ts';

interface InteractionData {
  interactionType: FirstInteractionType;
  target: Element | null;
  timestamp: number;
  x?: number;
  y?: number;
}

/*
  Captures the first user input event in each session part and emits one log
  per part. Listeners are detached after the first event is logged.
*/
export class FirstInteractionInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onClick: (event: PointerEvent) => void;
  private readonly _onKeyDown: (event: KeyboardEvent) => void;
  private readonly _onScroll: (event: Event) => void;
  private _listenersAttached = false;
  private _removeSessionPartStartedFn: (() => void) | null = null;

  public constructor({ diag, perf }: FirstInteractionInstrumentationArgs = {}) {
    super({
      instrumentationName: 'FirstInteractionInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._onClick = (event: PointerEvent): void => {
      this._handle({
        interactionType: event.pointerType === 'touch' ? 'tap' : 'click',
        target: event.target instanceof Element ? event.target : null,
        timestamp: event.timeStamp,
        x: event.clientX,
        y: event.clientY,
      });
    };

    this._onKeyDown = (event: KeyboardEvent): void => {
      this._handle({
        interactionType: 'keypress',
        target: event.target instanceof Element ? event.target : null,
        timestamp: event.timeStamp,
      });
    };

    this._onScroll = (event: Event): void => {
      this._handle({
        interactionType: 'scroll',
        target: null,
        timestamp: event.timeStamp,
      });
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  public enable(): void {
    this._attachListeners();

    if (!this._removeSessionPartStartedFn) {
      this._removeSessionPartStartedFn =
        this.userSessionManager.addSessionPartStartedListener(() => {
          this._attachListeners();
        });
    }
  }

  public disable(): void {
    this._detachListeners();

    if (this._removeSessionPartStartedFn) {
      this._removeSessionPartStartedFn();
      this._removeSessionPartStartedFn = null;
    }
  }

  private _handle(data: InteractionData): void {
    if (!this._listenersAttached) {
      // It's possible two handlers fire in quick succession before the listeners
      // are detached. We only want to process the first one.
      return;
    }

    this._detachListeners();

    try {
      this._emit(data);
    } catch (e) {
      this._diag.error('failed to process first-interaction candidate', e);
    }
  }

  private _attachListeners(): void {
    if (this._listenersAttached) {
      return;
    }

    const opts: AddEventListenerOptions = { capture: true, passive: true };

    document.addEventListener('click', this._onClick, opts);
    document.addEventListener('keydown', this._onKeyDown, opts);
    document.addEventListener('scroll', this._onScroll, opts);

    this._listenersAttached = true;
  }

  private _detachListeners(): void {
    if (!this._listenersAttached) {
      return;
    }

    const opts: EventListenerOptions = { capture: true };

    document.removeEventListener('click', this._onClick, opts);
    document.removeEventListener('keydown', this._onKeyDown, opts);
    document.removeEventListener('scroll', this._onScroll, opts);

    this._listenersAttached = false;
  }

  private _emit(data: InteractionData): void {
    let elementType = 'document';
    let elementSelector = '';

    if (data.interactionType !== 'scroll' && data.target) {
      elementType = data.target.tagName.toLowerCase();
      elementSelector = getSelector(data.target);
    }

    const attributes: Record<string, string | number> = {
      [KEY_EMB_TYPE]: EMB_TYPES.OTelLog,
      [ATTR_FIRST_INTERACTION_INTERACTION_TYPE]: data.interactionType,
      [ATTR_FIRST_INTERACTION_ELEMENT_TYPE]: elementType,
      [ATTR_FIRST_INTERACTION_ELEMENT_SELECTOR]: elementSelector,
    };

    if (data.x !== undefined && data.y !== undefined) {
      attributes[ATTR_FIRST_INTERACTION_X] = data.x;
      attributes[ATTR_FIRST_INTERACTION_Y] = data.y;
    }

    this.logger.emit({
      timestamp: this.perf.epochMillisFromZeroTime(data.timestamp),
      eventName: FIRST_INTERACTION_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes,
    });
  }
}
