import { SeverityNumber } from '@opentelemetry/api-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/attributes.ts';
import { getSelector } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { InteractionType } from './constants.ts';
import {
  ATTR_RAGE_CLICK_COUNT,
  ATTR_RAGE_CLICK_ELEMENT_SELECTOR,
  ATTR_RAGE_CLICK_ELEMENT_TYPE,
  ATTR_RAGE_CLICK_INTERACTION_TYPE,
  ATTR_RAGE_CLICK_X,
  ATTR_RAGE_CLICK_Y,
  RAGE_CLICK_EVENT_NAME,
  RAGE_CLICK_RADIUS,
  RAGE_CLICK_THRESHOLD,
  RAGE_CLICK_WINDOW_TIME,
} from './constants.ts';
import type { RageClickInstrumentationArgs } from './types.ts';

/**
 * Rage clicks are tracked in an "event window" defined by the first click. The
 * window is automatically reset after RAGE_CLICK_WINDOW_TIME.
 */
interface RageClickWindow {
  target: Element;
  x: number;
  y: number;
  count: number;
  interactionType: InteractionType;
  timestamp: number;
  timeoutId: number;
}

/*
  Detects when the user makes multiple rapid clicks ("rage clicks") in a target
  area, and emits one log per rage click.
*/
export class RageClickInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onClickHandler: (event: MouseEvent) => void;
  private _eventWindow: RageClickWindow | null = null;

  public constructor({ diag, perf }: RageClickInstrumentationArgs = {}) {
    super({
      instrumentationName: 'RageClickInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._onClickHandler = (event: MouseEvent): void => {
      try {
        this._handleClick(event);
      } catch (e) {
        this._diag.error('failed to process rage-click candidate', e);
      }
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override onDisable(): void {
    document.removeEventListener('click', this._onClickHandler);
    this._flush();
  }

  public override onEnable(): void {
    document.addEventListener('click', this._onClickHandler);
  }

  private _handleClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) {
      return;
    }

    const target = event.target;
    const interactionType: InteractionType =
      event instanceof PointerEvent && event.pointerType === 'touch'
        ? 'tap'
        : 'click';

    if (this._eventWindow === null) {
      this._eventWindow = {
        target,
        x: event.clientX,
        y: event.clientY,
        count: 1,
        interactionType,
        timestamp: event.timeStamp,
        timeoutId: window.setTimeout(() => {
          try {
            this._flush();
          } catch (e) {
            this._diag.error('failed to emit rage-click log', e);
          }
        }, RAGE_CLICK_WINDOW_TIME),
      };

      return;
    }

    const sameTarget = target === this._eventWindow.target;
    const dx = Math.abs(event.clientX - this._eventWindow.x);
    const dy = Math.abs(event.clientY - this._eventWindow.y);
    const withinRadius = dx <= RAGE_CLICK_RADIUS && dy <= RAGE_CLICK_RADIUS;

    if (sameTarget || withinRadius) {
      this._eventWindow.count += 1;
    }
  }

  private _flush(): void {
    if (this._eventWindow === null) {
      // No active window, probably because the instrumentation was disabled
      return;
    }

    const eventWindow = this._eventWindow;

    // Ensure the current window is reset, regardless of whether we emit the log or not
    window.clearTimeout(eventWindow.timeoutId);
    this._eventWindow = null;

    if (eventWindow.count < RAGE_CLICK_THRESHOLD) {
      // Not enough clicks to be considered a rage click event
      return;
    }

    this.logger.emit({
      timestamp: this.perf.epochMillisFromOrigin(eventWindow.timestamp),
      eventName: RAGE_CLICK_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.OTelLog,
        [ATTR_RAGE_CLICK_ELEMENT_TYPE]:
          eventWindow.target.tagName.toLowerCase(),
        [ATTR_RAGE_CLICK_ELEMENT_SELECTOR]: getSelector(eventWindow.target),
        [ATTR_RAGE_CLICK_X]: eventWindow.x,
        [ATTR_RAGE_CLICK_Y]: eventWindow.y,
        [ATTR_RAGE_CLICK_COUNT]: eventWindow.count,
        [ATTR_RAGE_CLICK_INTERACTION_TYPE]: eventWindow.interactionType,
      },
    });
  }
}
