import type { Attributes } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../constants/attributes.ts';
import type { DocumentMeasurement } from '../../../utils/index.ts';
import { measureDocument } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import {
  ATTR_DOM_STATE_AVERAGE_DEPTH,
  ATTR_DOM_STATE_DOCUMENT_HEIGHT,
  ATTR_DOM_STATE_DOCUMENT_WIDTH,
  ATTR_DOM_STATE_ELEMENT_COUNT,
  ATTR_DOM_STATE_IMAGES_ABOVE_FOLD_COUNT,
  ATTR_DOM_STATE_IMAGES_ABOVE_FOLD_TIMESTAMP,
  ATTR_DOM_STATE_IMAGES_ABOVE_FOLD_VIEWPORT_HEIGHT,
  ATTR_DOM_STATE_IMAGES_ABOVE_FOLD_VIEWPORT_WIDTH,
  ATTR_DOM_STATE_TRAVERSAL_LIMIT_REACHED,
  DOM_STATE_EVENT_NAME,
  DOM_STATE_MAX_TRAVERSED_ELEMENTS,
} from './constants.ts';
import type { DOMStateInstrumentationArgs } from './types.ts';

/*
  Captures DOM-shape measurements as one `dom-state` log per session part end:
  element count, average depth, and the document box, all measured at the part
  end itself.

  The fold measurement (images above the fold, the viewport they were judged
  against, and its capture time as `images_above_fold.timestamp`) describes what
  the user sees first: at most one per page, taken only while a session part is
  engaged, at the load event, at the first part start after a load nobody
  watched, or at attach to an already loaded page. It rides the first part-end
  log sent after the capture.
*/
export class DOMStateInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onLoad: () => void;
  // The page's one attempt, spent inside the first engaged part whatever it yields.
  private _foldMeasured = false;
  private _pendingFoldAttributes: Attributes | null = null;

  public constructor({ diag, perf }: DOMStateInstrumentationArgs = {}) {
    super({
      instrumentationName: 'DOMStateInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._onLoad = (): void => {
      this._captureFoldMeasurement();
    };
  }

  public override onEnable(): void {
    if (this._hasLoadEventFired()) {
      // Attaching to a page that already loaded: no load event is coming, so
      // this is the only trigger left. The measurement is spent once, so a
      // re-enable takes none of its own.
      this._captureFoldMeasurement();
    } else {
      window.addEventListener('load', this._onLoad, { once: true });
    }

    this.setSessionPartListeners({
      start: () => {
        if (this._hasLoadEventFired()) {
          // A page that loaded unwatched gets its fold measured here; a load
          // still to come belongs to the armed listener. A part starting inside
          // the load dispatch also lands here, in either listener order.
          this._captureFoldMeasurement();
        }
      },
      end: () => {
        // The fold capture belongs to this part end alone: consumed up front,
        // so a throw anywhere below cannot carry it into a later part's log.
        const pendingFoldAttributes = this._pendingFoldAttributes;
        this._pendingFoldAttributes = null;
        try {
          this._sendLog({
            ...this._buildSessionPartEndAttributes(),
            ...pendingFoldAttributes,
          });
        } catch (e) {
          this._diag.error('failed to emit the dom-state part-end log', e);
        }
      },
    });
  }

  public override onDisable(): void {
    window.removeEventListener('load', this._onLoad);
    this._pendingFoldAttributes = null;
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

  private _captureFoldMeasurement(): void {
    try {
      if (this._foldMeasured) {
        return;
      }

      if (this.userSessionManager.getSessionPartId() === null) {
        // Nobody is looking at the page; the part-start listener measures once
        // it is engaged.
        this._diag.debug(
          'dom-state fold measurement skipped: no engaged session part',
        );
        return;
      }

      this._foldMeasured = true;

      const measurement = measureDocument();
      if (!measurement) {
        // A frame with no viewport has no view to describe.
        this._diag.debug(
          'dom-state fold measurement skipped: no viewport to measure',
        );
        return;
      }

      this._pendingFoldAttributes = {
        [ATTR_DOM_STATE_IMAGES_ABOVE_FOLD_COUNT]:
          this._countImagesAboveFold(measurement),
        [ATTR_DOM_STATE_IMAGES_ABOVE_FOLD_VIEWPORT_HEIGHT]:
          measurement.viewportHeight,
        [ATTR_DOM_STATE_IMAGES_ABOVE_FOLD_VIEWPORT_WIDTH]:
          measurement.viewportWidth,
        [ATTR_DOM_STATE_IMAGES_ABOVE_FOLD_TIMESTAMP]: this.perf.getNowMillis(),
      };
    } catch (e) {
      this._diag.error('failed to capture dom-state fold measurement', e);
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
      // Nothing to walk and nothing to measure both drop their keys rather than
      // report a zero, so the part still gets a log for whatever remains.
      ...(tree === null
        ? {}
        : tree.limitReached
          ? { [ATTR_DOM_STATE_TRAVERSAL_LIMIT_REACHED]: true }
          : {
              [ATTR_DOM_STATE_ELEMENT_COUNT]: tree.elementCount,
              // The traversal counts its root, so elementCount is at least 1.
              [ATTR_DOM_STATE_AVERAGE_DEPTH]:
                tree.totalDepth / tree.elementCount,
            }),
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

  private _sendLog(attributes: Attributes): void {
    this.logger.emit({
      eventName: DOM_STATE_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes,
    });
  }

  // Iterative depth-first traversal that computes element count and summed depth
  // in one pass. The root passed in sits at depth 1. Runs synchronously on the
  // pagehide path, so it bails at the ceiling rather than spend the unload
  // budget on a pathological tree.
  private _traverse(
    root: Element,
  ):
    | { limitReached: false; elementCount: number; totalDepth: number }
    | { limitReached: true } {
    let elementCount = 0;
    let totalDepth = 0;

    const stack: Array<{ element: Element; depth: number }> = [
      { element: root, depth: 1 },
    ];
    for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
      elementCount++;
      totalDepth += entry.depth;
      const { children } = entry.element;
      // Popped, queued and about-to-queue are disjoint, so their sum lower-bounds the
      // tree size; checking before the push bounds the bail cost even on wide trees.
      if (
        elementCount + stack.length + children.length >
        DOM_STATE_MAX_TRAVERSED_ELEMENTS
      ) {
        this._diag.debug(
          `dom-state tree walk bailed: the tree exceeds the ${String(DOM_STATE_MAX_TRAVERSED_ELEMENTS)}-element traversal ceiling`,
        );
        return { limitReached: true };
      }
      for (let i = 0; i < children.length; i++) {
        stack.push({ element: children[i], depth: entry.depth + 1 });
      }
    }

    return { limitReached: false, elementCount, totalDepth };
  }
}
