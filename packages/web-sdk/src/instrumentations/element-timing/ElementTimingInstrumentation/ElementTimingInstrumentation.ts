import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/index.ts';
import {
  createPerformanceObserver,
  isEntryTypeSupported,
} from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  KEY_EMB_ELEMENT_TIMING_ELEMENT,
  KEY_EMB_ELEMENT_TIMING_IDENTIFIER,
  KEY_EMB_ELEMENT_TIMING_LOAD_TIME,
  KEY_EMB_ELEMENT_TIMING_NATURAL_HEIGHT,
  KEY_EMB_ELEMENT_TIMING_NATURAL_WIDTH,
  KEY_EMB_ELEMENT_TIMING_RENDER_TIME,
  KEY_EMB_ELEMENT_TIMING_START_TIME,
  KEY_EMB_ELEMENT_TIMING_URL,
} from './constants.ts';
import type { PerformanceElementTiming } from './types.ts';

export class ElementTimingInstrumentation extends EmbraceInstrumentationBase {
  private _observer: PerformanceObserver | null = null;

  public constructor() {
    super({
      instrumentationName: 'ElementTimingInstrumentation',
      instrumentationVersion: '1.0.0',
      config: {},
    });
  }

  /** Whether this browser reports element entries. initSDK skips the default instance when it does not. */
  public static isSupported(): boolean {
    return isEntryTypeSupported('element');
  }

  protected override _init(): void {
    if (!ElementTimingInstrumentation.isSupported()) {
      throw new Error('element entries are not supported');
    }
  }

  protected override _onEnable(): void {
    this._observer = createPerformanceObserver<PerformanceElementTiming>(
      'element',
      (entry) => this._processEntry(entry),
      { diag: this._diag },
    );

    if (!this._observer) {
      throw new Error('could not observe element entries');
    }
  }

  protected override _onDisable(): void {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  private _processEntry(entry: PerformanceElementTiming): void {
    if (!this.isEnabled()) {
      return;
    }

    if (this.limitManager?.limitElementTimingEntry()) {
      return;
    }

    const span = this.tracer.startSpan(entry.identifier, {
      // Span start anchors to the SDK's zero time (start of the current view) so the span
      // duration equals "time since the user started viewing this page until the element
      // was rendered" — useful for analyzing render timing relative to the current view.
      startTime: this.perf.getZeroTime(entry.startTime),
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.ElementTiming,
        [KEY_EMB_ELEMENT_TIMING_IDENTIFIER]: entry.identifier,
        [KEY_EMB_ELEMENT_TIMING_ELEMENT]: entry.element?.tagName?.toLowerCase(),
        [KEY_EMB_ELEMENT_TIMING_RENDER_TIME]: this.perf.getOffsetFromZeroTime(
          entry.renderTime,
        ),
        [KEY_EMB_ELEMENT_TIMING_LOAD_TIME]: this.perf.getOffsetFromZeroTime(
          entry.loadTime,
        ),
        [KEY_EMB_ELEMENT_TIMING_START_TIME]: this.perf.getOffsetFromZeroTime(
          entry.startTime,
        ),
        [KEY_EMB_ELEMENT_TIMING_URL]: entry.url,
        [KEY_EMB_ELEMENT_TIMING_NATURAL_WIDTH]: entry.naturalWidth,
        [KEY_EMB_ELEMENT_TIMING_NATURAL_HEIGHT]: entry.naturalHeight,
      },
    });
    if (entry.loadTime > 0) {
      span.addEvent(
        'load',
        this.perf.offsetToAbsoluteTime(entry.loadTime, entry.startTime),
      );
    }
    // entry.startTime = renderTime if non-zero, else loadTime
    span.end(this.perf.offsetToAbsoluteTime(entry.startTime));
  }
}
