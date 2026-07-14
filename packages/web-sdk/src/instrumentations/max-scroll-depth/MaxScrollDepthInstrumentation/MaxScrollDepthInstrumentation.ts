import { SeverityNumber } from '@opentelemetry/api-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/attributes.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  ATTR_MAX_SCROLL_DEPTH_DID_SCROLL,
  ATTR_MAX_SCROLL_DEPTH_DOCUMENT_HEIGHT,
  ATTR_MAX_SCROLL_DEPTH_PERCENT,
  ATTR_MAX_SCROLL_DEPTH_PIXELS,
  MAX_SCROLL_DEPTH_EVENT_NAME,
} from './constants.ts';
import type { MaxScrollDepthInstrumentationArgs } from './types.ts';

/*
  Tracks how far the user scrolls during and emits telemetry when the session part ends
*/
// Timing frame: none, no timing data (see src/utils/PerformanceManager/README.md)
export class MaxScrollDepthInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onScrollHandler: () => void;
  private _hasScrolled = false;
  private _maxScrollY = 0;

  public constructor({ diag, perf }: MaxScrollDepthInstrumentationArgs = {}) {
    super({
      instrumentationName: 'MaxScrollDepthInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._onScrollHandler = (): void => {
      try {
        // Reading scrollY here does not force a layout, so the work the listener does can stay minimal.
        const scrollY = window.scrollY;
        if (scrollY > this._maxScrollY) {
          this._maxScrollY = scrollY;
        }
        this._hasScrolled = true;
      } catch (e) {
        this._diag.error('failed to process scroll', e);
      }
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override onEnable(): void {
    window.addEventListener('scroll', this._onScrollHandler, { passive: true });
    this.setSessionPartListeners({
      end: () => {
        try {
          this._emit();
        } catch (e) {
          this._diag.error('failed to emit max-scroll-depth log', e);
        }
      },
    });
  }

  public override onDisable(): void {
    window.removeEventListener('scroll', this._onScrollHandler);
  }

  private _emit(): void {
    // Read scrollHeight once here since it forces a layout reflow rather than on every scroll event.
    // https://developer.chrome.com/docs/performance/insights/forced-reflow
    const documentHeight = document.documentElement.scrollHeight;
    const viewportHeight = window.innerHeight;
    const scrollBottom = documentHeight - viewportHeight;
    const scrollPercent =
      scrollBottom > 0
        ? Math.min(
            100,
            Math.max(0, Math.round((this._maxScrollY / scrollBottom) * 100)),
          )
        : 0;

    this.logger.emit({
      eventName: MAX_SCROLL_DEPTH_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.OTelLog,
        [ATTR_MAX_SCROLL_DEPTH_PIXELS]: this._maxScrollY,
        [ATTR_MAX_SCROLL_DEPTH_PERCENT]: scrollPercent,
        [ATTR_MAX_SCROLL_DEPTH_DID_SCROLL]: this._hasScrolled,
        [ATTR_MAX_SCROLL_DEPTH_DOCUMENT_HEIGHT]: documentHeight,
      },
    });

    // Initial state for the next part will be wherever the user left off the scroll position
    this._hasScrolled = false;
    this._maxScrollY = window.scrollY;
  }
}
