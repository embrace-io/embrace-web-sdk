/**
 * A point-in-time reading of the document and viewport boxes, in integer CSS
 * pixels. Resize, zoom, and content mutation all invalidate it.
 *
 * `viewportHeight`/`viewportWidth` are the box the document scrolls inside,
 * read from the scroll root's client box, or from the window where there is
 * no scroll root.
 *
 * `scrollableHeight` is the scrollable range the measurement supports, floored
 * at zero: exact off a scroll root, approximate where the viewport came from
 * the window. Take it rather than subtracting the boxes, which can go negative.
 */
export interface DocumentMeasurement {
  documentHeight: number;
  documentWidth: number;
  scrollableHeight: number;
  viewportHeight: number;
  viewportWidth: number;
}

/**
 * Measures the document off `document.scrollingElement`, the only element whose
 * scroll box spans the viewport's scrolling area. In quirks mode `<html>` reports
 * just its own, dropping its margin, border, and out-of-flow content, so it
 * stands in only where there is no scroll root. The viewport cannot come from
 * `<html>` either, whose quirks-mode client box is its own padding box, so it
 * comes from the scroll root or else the window. Returns `null` where there is
 * no browsing context, no root element, or nothing rendered.
 * https://developer.mozilla.org/en-US/docs/Web/API/Document/scrollingElement
 */
export const measureDocument = (
  doc: Document = document,
): DocumentMeasurement | null => {
  // No browsing context, so nothing reports a viewport.
  const view = doc.defaultView;
  if (!view) {
    return null;
  }

  const scrollRoot = doc.scrollingElement;
  const documentSource = scrollRoot ?? doc.documentElement;

  // A document whose root element was removed has nothing to measure.
  if (!documentSource) {
    return null;
  }

  // Reading a dimension forces a synchronous layout reflow, so all four are read
  // together with nothing written in between, and returned as one snapshot.
  // https://developer.chrome.com/docs/performance/insights/forced-reflow
  const documentHeight = documentSource.scrollHeight;
  const documentWidth = documentSource.scrollWidth;
  // The window stands in only where there is no scroll root to read the
  // viewport off.
  const viewportHeight = scrollRoot?.clientHeight ?? view.innerHeight;
  const viewportWidth = scrollRoot?.clientWidth ?? view.innerWidth;

  // Nothing renders, as in a frame sized to zero or display:none, or the
  // document source reports no box at all.
  if (!documentHeight || !documentWidth || !viewportHeight || !viewportWidth) {
    return null;
  }

  return {
    documentHeight,
    documentWidth,
    scrollableHeight: Math.max(0, documentHeight - viewportHeight),
    viewportHeight,
    viewportWidth,
  };
};
