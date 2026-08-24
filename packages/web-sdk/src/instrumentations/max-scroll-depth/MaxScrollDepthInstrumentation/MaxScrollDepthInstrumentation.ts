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
  Tracks how far the user scrolls during a session part and emits telemetry when the part ends
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
        // The handler only reads scrollY; the layout-forcing document
        // measurement is deferred to part end, once per part rather than per event.
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
    // Depth accrued before a disabled gap must not be credited to whichever
    // part is open when tracking resumes, so the seed is taken here, not at disable.
    this._resetTracking(null);
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
    let measurement: DocumentMeasurement | null = null;

    try {
      // The scroll position is readable at any time, so an offset set before
      // this listener attached (e.g. a scroll restoration racing SDK init) is
      // still caught here.
      this._maxScrollY = Math.max(this._maxScrollY, window.scrollY);

      // Measure once here rather than on every scroll event, since reading
      // document geometry forces a layout reflow.
      // https://developer.chrome.com/docs/performance/insights/forced-reflow
      measurement = measureDocument();
      const percent = measurement
        ? this._scrollPercent(measurement)
        : undefined;

      this.logger.emit({
        eventName: MAX_SCROLL_DEPTH_EVENT_NAME,
        severityNumber: SeverityNumber.INFO,
        attributes: {
          [KEY_EMB_TYPE]: EMB_TYPES.OTelLog,
          [ATTR_MAX_SCROLL_DEPTH_PIXELS]: this._maxScrollY,
          [ATTR_MAX_SCROLL_DEPTH_DID_SCROLL]: this._hasScrolled,
          // Absent beats a fabricated 0: percent needs a viewport and a current
          // range, the height needs a viewport, and pixels need neither.
          ...(measurement
            ? {
                ...(percent === undefined
                  ? {}
                  : { [ATTR_MAX_SCROLL_DEPTH_PERCENT]: percent }),
                [ATTR_MAX_SCROLL_DEPTH_DOCUMENT_HEIGHT]:
                  measurement.documentHeight,
              }
            : {}),
        },
      });
    } finally {
      this._resetTracking(measurement);
    }
  }

  // Initial state for the next part is wherever the user left off, bounded by
  // the measured range: Safari can report a position past either edge during
  // rubber-band overscroll, which the next part's document cannot hold.
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollY
  private _resetTracking(measurement: DocumentMeasurement | null): void {
    this._hasScrolled = false;
    this._maxScrollY = measurement
      ? Math.max(0, Math.min(window.scrollY, measurement.scrollableHeight))
      : Math.max(0, window.scrollY);
  }

  private _scrollPercent({
    scrollableHeight,
    viewportHeight,
  }: DocumentMeasurement): number | undefined {
    // Rubber-band overscroll cannot carry the content further than its own
    // viewport, so a larger excess means the document shrank since the depth was
    // reached; the range no longer describes it, so omit rather than fabricate.
    const overshoot = this._maxScrollY - scrollableHeight;
    if (overshoot > viewportHeight) {
      this._diag.debug('omitting max-scroll-depth percent, range is stale', {
        maxScrollY: this._maxScrollY,
        scrollableHeight,
        viewportHeight,
      });
      return undefined;
    }

    if (scrollableHeight === 0) {
      // The document fits the viewport, so there was no depth to reach.
      return 0;
    }

    return Math.min(
      100,
      Math.round((this._maxScrollY / scrollableHeight) * 100),
    );
  }
}
