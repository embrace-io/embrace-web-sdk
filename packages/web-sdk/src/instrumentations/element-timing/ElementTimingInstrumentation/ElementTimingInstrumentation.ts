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
import type {
  ElementTimingInstrumentationArgs,
  PerformanceElementTiming,
} from './types.ts';

export class ElementTimingInstrumentation extends EmbraceInstrumentationBase {
  private _observer: PerformanceObserver | null = null;

  public constructor({
    diag,
    perf,
    limitManager,
  }: ElementTimingInstrumentationArgs = {}) {
    super({
      instrumentationName: 'ElementTimingInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      limitManager,
      config: {},
    });
  }

  public override enable(): void {
    if (isEntryTypeSupported('element')) {
      super.enable();
    } else {
      this._diag.debug('element not supported, skipping');
    }
  }

  public override onEnable(): void {
    if (this._observer) {
      this._observer.disconnect();
    }

    this._observer = createPerformanceObserver<PerformanceElementTiming>(
      'element',
      (entry) => this._processEntry(entry),
      { diag: this._diag },
    );

    if (!this._observer) {
      this._isEnabled = false;
      this._diag.error('failed to enable');
      return;
    }
  }

  public onDisable(): void {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  private _processEntry(entry: PerformanceElementTiming): void {
    if (!this._isEnabled) {
      return;
    }

    if (this.limitManager?.limitElementTimingEntry()) {
      return;
    }

    const span = this.tracer.startSpan(entry.identifier, {
      // Span start anchors to the SDK's zero time (start of the current view) so the span
      // duration equals "time since the user started viewing this page until the element
      // was rendered" — useful for analyzing render timing relative to the current view.
      startTime: this.perf.getZeroTime(),
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.ElementTiming,
        [KEY_EMB_ELEMENT_TIMING_IDENTIFIER]: entry.identifier,
        [KEY_EMB_ELEMENT_TIMING_ELEMENT]: entry.element?.tagName?.toLowerCase(),
        [KEY_EMB_ELEMENT_TIMING_RENDER_TIME]: this.perf.millisFromZeroTime(
          entry.renderTime,
        ),
        [KEY_EMB_ELEMENT_TIMING_LOAD_TIME]: this.perf.millisFromZeroTime(
          entry.loadTime,
        ),
        [KEY_EMB_ELEMENT_TIMING_START_TIME]: this.perf.millisFromZeroTime(
          entry.startTime,
        ),
        [KEY_EMB_ELEMENT_TIMING_URL]: entry.url,
        [KEY_EMB_ELEMENT_TIMING_NATURAL_WIDTH]: entry.naturalWidth,
        [KEY_EMB_ELEMENT_TIMING_NATURAL_HEIGHT]: entry.naturalHeight,
      },
    });
    if (entry.loadTime > 0) {
      span.addEvent('load', this.perf.epochMillisFromOrigin(entry.loadTime));
    }
    // entry.startTime = renderTime if non-zero, else loadTime
    span.end(this.perf.epochMillisFromOrigin(entry.startTime));
  }
}
