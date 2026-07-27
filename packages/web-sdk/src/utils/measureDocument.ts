/**
 * A point-in-time reading of the document and viewport boxes, in integer CSS
 * pixels. Resize, zoom, and content mutation all invalidate it.
 *
 * `viewportHeight`/`viewportWidth` are the scroll root's client box, which
 * excludes any space a classic scrollbar takes, so they are `<=`
 * `window.innerHeight`/`innerWidth` rather than equal to them. The document
 * boxes are always `>=` their viewport counterparts, and the scrollable range
 * is the difference between the two.
 */
export interface DocumentMeasurement {
  documentHeight: number;
  documentWidth: number;
  viewportHeight: number;
  viewportWidth: number;
}

/**
 * Measures the document's content size and the viewport size off
 * `document.scrollingElement`, which is the document root in standards mode,
 * and in quirks mode is `<body>` only when `<body>` is not itself potentially
 * scrollable. Reading `documentElement` or `<body>` directly is correct in only
 * one of the two modes.
 *
 * Returns `null` in the remaining quirks-mode cases, and when the scroll root
 * has no layout box. The document may still scroll in the quirks-mode case, but
 * no element measures it correctly, so callers should report the absence rather
 * than substitute a zero that would read as a real measurement.
 * https://developer.mozilla.org/en-US/docs/Web/API/Document/scrollingElement
 */
export const measureDocument = (): DocumentMeasurement | null => {
  const scrollRoot = document.scrollingElement;
  if (!scrollRoot) {
    return null;
  }

  const viewportHeight = scrollRoot.clientHeight;
  const viewportWidth = scrollRoot.clientWidth;
  // A non-rendered or zero-sized frame has a scroll root with no layout box.
  if (!viewportHeight || !viewportWidth) {
    return null;
  }

  return {
    documentHeight: scrollRoot.scrollHeight,
    documentWidth: scrollRoot.scrollWidth,
    viewportHeight,
    viewportWidth,
  };
};
