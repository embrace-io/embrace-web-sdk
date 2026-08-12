import type { Attributes } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import {
  EMB_TYPES,
  KEY_EMB_SESSION_PART_ID,
  KEY_EMB_TYPE,
} from '../../../constants/attributes.ts';
import type { UserSessionManagerInternal } from '../../../managers/index.ts';
import type { DocumentMeasurement } from '../../../utils/index.ts';
import { measureDocument } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  ATTR_DOM_STATE_AVERAGE_DEPTH,
  ATTR_DOM_STATE_DOCUMENT_HEIGHT,
  ATTR_DOM_STATE_DOCUMENT_WIDTH,
  ATTR_DOM_STATE_ELEMENT_COUNT,
  ATTR_DOM_STATE_IMAGES_ABOVE_FOLD,
  ATTR_DOM_STATE_PHASE,
  ATTR_DOM_STATE_VIEWPORT_HEIGHT,
  ATTR_DOM_STATE_VIEWPORT_WIDTH,
  DOM_STATE_EVENT_NAME,
} from './constants.ts';
import type { DOMStateInstrumentationArgs } from './types.ts';

// The part-end log is the only other shape, phased 'session_part_end'.
type DOMStateViewPhase = 'load' | 'after_load' | 'session_part_start';

/*
  Captures DOM-shape measurements as `dom-state` logs, all sent at session part
  end and told apart by `dom_state.phase`.

  The view measurement (viewport size, images above the fold) describes what the
  user sees first: at most one per page, timestamped at capture, taken only while
  a session part is engaged. Its phase says where it was taken: the load event
  (`load`), the first part start after a load nobody watched
  (`session_part_start`), or attach to an already loaded page (`after_load`).

  The `session_part_end` measurement (element count, average depth, document
  box) goes out for every part that ends.
*/
export class DOMStateInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onLoadHandler: () => void;
  // The page's one attempt, spent inside the first engaged part whatever it yields.
  private _viewMeasured = false;
  private _heldViewLog: {
    attributes: Attributes;
    timestamp: number;
    sessionPartId: string;
  } | null = null;

  public constructor({ diag, perf }: DOMStateInstrumentationArgs = {}) {
    super({
      instrumentationName: 'DOMStateInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._onLoadHandler = (): void => {
      this._captureViewLog('load');
    };

    if (this._config.enabled) {
      this.enable();
      if (this._hasLoadEventFired()) {
        // Here rather than in onEnable so a re-enable takes no measurement of
        // its own.
        this._captureViewLog('after_load');
      }
    }
  }

  public override onEnable(): void {
    if (!this._hasLoadEventFired()) {
      window.addEventListener('load', this._onLoadHandler, { once: true });
    }

    this.setSessionPartListeners({
      start: () => {
        if (this._hasLoadEventFired()) {
          // A page that loaded unwatched gets its first view here; a load still
          // to come belongs to the armed listener. A part starting inside the
          // load dispatch also lands here, in either listener order.
          this._captureViewLog('session_part_start');
        }
      },
      end: () => {
        // Neither log's failure may cost the part the other one.
        const heldViewLog = this._heldViewLog;
        if (heldViewLog) {
          // Cleared before the send so a throw cannot re-queue it.
          this._heldViewLog = null;
          try {
            this._sendLog(heldViewLog.attributes, heldViewLog.timestamp);
          } catch (e) {
            this._diag.error('failed to flush the dom-state view log', e);
          }
        }

        try {
          this._sendLog(this._buildSessionPartEndAttributes());
        } catch (e) {
          this._diag.error('failed to emit the dom-state part-end log', e);
        }
      },
    });
  }

  public override onDisable(): void {
    window.removeEventListener('load', this._onLoadHandler);
    this._heldViewLog = null;
  }

  public override setUserSessionManager(
    userSessionManager: UserSessionManagerInternal,
  ): void {
    super.setUserSessionManager(userSessionManager);
    // A snapshot captured through the global proxy can carry another
    // instance's part id; it must not survive the wiring of the real manager.
    if (
      this._heldViewLog &&
      this._heldViewLog.sessionPartId !== userSessionManager.getSessionPartId()
    ) {
      this._heldViewLog = null;
      this._viewMeasured = false;
    }
    // Per-instance wiring delivers the manager after construction, when the
    // capture attempt saw no engaged part. Try again.
    if (this._isEnabled && this._hasLoadEventFired()) {
      this._captureViewLog('after_load');
    }
  }

  private _hasLoadEventFired(): boolean {
    const navigation = this.perf.getNavigationEntry();

    // WebKit gives about:blank and srcdoc documents no navigation entry at all;
    // readiness is the only signal left, pre-dispatch gap and all.
    if (!navigation) {
      return document.readyState === 'complete';
    }

    return navigation.loadEventStart > 0;
  }

  private _captureViewLog(phase: DOMStateViewPhase): void {
    try {
      if (this._viewMeasured) {
        return;
      }

      const sessionPartId = this.userSessionManager.getSessionPartId();
      if (sessionPartId === null) {
        // Nobody is looking at the page; the part-start listener measures once
        // it is engaged.
        this._diag.debug(
          'dom-state view measurement skipped: no engaged session part',
        );
        return;
      }

      this._viewMeasured = true;

      const measurement = measureDocument();
      if (!measurement) {
        // A frame with no viewport has no view to describe.
        this._diag.debug(
          'dom-state view measurement skipped: no viewport to measure',
        );
        return;
      }

      this._heldViewLog = {
        attributes: {
          [KEY_EMB_TYPE]: EMB_TYPES.OTelLog,
          [KEY_EMB_SESSION_PART_ID]: sessionPartId,
          [ATTR_DOM_STATE_PHASE]: phase,
          [ATTR_DOM_STATE_VIEWPORT_HEIGHT]: measurement.viewportHeight,
          [ATTR_DOM_STATE_VIEWPORT_WIDTH]: measurement.viewportWidth,
          [ATTR_DOM_STATE_IMAGES_ABOVE_FOLD]:
            this._countImagesAboveFold(measurement),
        },
        timestamp: this.perf.getNowMillis(),
        sessionPartId,
      };
    } catch (e) {
      this._diag.error('failed to capture dom-state view measurement', e);
    }
  }

  private _buildSessionPartEndAttributes(): Attributes {
    const measurement = measureDocument();

    // Typed non-nullable, but a document whose root element was removed has none.
    const root: Element | null = document.documentElement;
    // <head> counts toward total and depth. `children` sees only light DOM, so
    // shadow-DOM-heavy pages measure smaller than they render.
    const tree = root ? this._traverse(root) : null;

    return {
      [KEY_EMB_TYPE]: EMB_TYPES.OTelLog,
      [ATTR_DOM_STATE_PHASE]: 'session_part_end',
      // Nothing to walk and nothing to measure both drop their keys rather than
      // report a zero, so the part still gets a log for whatever remains.
      ...(tree
        ? {
            [ATTR_DOM_STATE_ELEMENT_COUNT]: tree.elementCount,
            // The traversal counts its root, so elementCount is at least 1.
            [ATTR_DOM_STATE_AVERAGE_DEPTH]: tree.totalDepth / tree.elementCount,
          }
        : {}),
      ...(measurement
        ? {
            [ATTR_DOM_STATE_DOCUMENT_HEIGHT]: measurement.documentHeight,
            [ATTR_DOM_STATE_DOCUMENT_WIDTH]: measurement.documentWidth,
          }
        : {}),
    };
  }

  private _countImagesAboveFold({
    viewportHeight,
    viewportWidth,
  }: DocumentMeasurement): number {
    // Rects are shifted into document space so a restored scroll offset cannot
    // move the fold; viewport-anchored elements (fixed, stuck sticky) are
    // misplaced by exactly that offset, inner-scroll content by its container's own.
    const { scrollY, scrollX } = window;
    // `document.images` sees only <img>: no CSS backgrounds, no inline SVG.
    const { images } = document;

    let count = 0;
    for (let i = 0; i < images.length; i++) {
      const rect = images[i].getBoundingClientRect();
      const overlapsFold =
        rect.bottom + scrollY > 0 &&
        rect.right + scrollX > 0 &&
        rect.top + scrollY < viewportHeight &&
        rect.left + scrollX < viewportWidth &&
        rect.width > 0 &&
        rect.height > 0;
      if (overlapsFold) {
        count++;
      }
    }

    return count;
  }

  private _sendLog(attributes: Attributes, timestamp?: number): void {
    this.logger.emit({
      eventName: DOM_STATE_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes,
      timestamp,
    });
  }

  // Iterative depth-first traversal that computes element count and summed depth
  // in one pass. The root passed in sits at depth 1.
  private _traverse(root: Element): {
    elementCount: number;
    totalDepth: number;
  } {
    let elementCount = 0;
    let totalDepth = 0;

    const stack: Array<{ element: Element; depth: number }> = [
      { element: root, depth: 1 },
    ];
    for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
      elementCount++;
      totalDepth += entry.depth;
      const { children } = entry.element;
      for (let i = 0; i < children.length; i++) {
        stack.push({ element: children[i], depth: entry.depth + 1 });
      }
    }

    return { elementCount, totalDepth };
  }
}
