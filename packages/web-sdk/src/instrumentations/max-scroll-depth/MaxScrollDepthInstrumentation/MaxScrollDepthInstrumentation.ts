import { SeverityNumber } from '@opentelemetry/api-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/attributes.ts';
import type { DocumentMeasurement } from '../../../utils/index.ts';
import { measureDocument } from '../../../utils/index.ts';
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
    // The scroll position is readable at any time, so a document that loaded at
    // a restored offset has already reached that depth even though no scroll
    // event ever fired for it.
    this._maxScrollY = Math.max(this._maxScrollY, window.scrollY);

    // Measure once here rather than on every scroll event, since reading
    // document geometry forces a layout reflow.
    // https://developer.chrome.com/docs/performance/insights/forced-reflow
    const measurement = measureDocument();

    this.logger.emit({
      eventName: MAX_SCROLL_DEPTH_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.OTelLog,
        [ATTR_MAX_SCROLL_DEPTH_PIXELS]: this._maxScrollY,
        [ATTR_MAX_SCROLL_DEPTH_DID_SCROLL]: this._hasScrolled,
        // Depth as a percentage needs a viewport, which a document or a frame
        // can lack. Omit it and the height together in that case so consumers
        // read absence rather than a fabricated 0. The pixel depth comes from
        // the scroll position alone, so it stands on its own.
        ...(measurement
          ? {
              [ATTR_MAX_SCROLL_DEPTH_PERCENT]: this._scrollPercent(measurement),
              [ATTR_MAX_SCROLL_DEPTH_DOCUMENT_HEIGHT]:
                measurement.documentHeight,
            }
          : {}),
      },
    });

    // Initial state for the next part will be wherever the user left off the
    // scroll position, clamped because Safari reports a negative position past
    // the top of the document during rubber-band overscroll, which is still the
    // top. https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollY
    this._hasScrolled = false;
    this._maxScrollY = Math.max(0, window.scrollY);
  }

  private _scrollPercent({ scrollableHeight }: DocumentMeasurement): number {
    if (scrollableHeight === 0) {
      // The document fits the viewport, so there was no depth to reach.
      return 0;
    }

    // The furthest point reached can exceed the range measured at part end: the
    // document may have shrunk since, or the position came from overscroll past
    // the bottom.
    return Math.min(
      100,
      Math.round((this._maxScrollY / scrollableHeight) * 100),
    );
  }
}
