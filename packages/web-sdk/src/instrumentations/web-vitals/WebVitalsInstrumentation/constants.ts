import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals/attribution';

export const EMB_WEB_VITALS_PREFIX = 'emb-web-vitals';
export const CORE_WEB_VITALS = ['CLS', 'INP', 'LCP'] as const;
export const ALL_WEB_VITALS = ['CLS', 'INP', 'LCP', 'FCP', 'TTFB'] as const;
export const WEB_VITALS_ID_TO_LISTENER = {
  /**
   *  Cumulative Layout Shift (CLS)
   *  https://web.dev/articles/cls
   *
   *  Measures _unexpected_ layout shifts throughout the lifespan of a page load. User-initiated shifts, e.g. showing
   *  a loading indicator after a user clicked a button that triggered a network request, are excluded since these are
   *  expected.
   *
   *  onCLS is always called when the page's visibility state changes to hidden and may be called multiple times for
   *  a single page load.
   *
   *  SPA Note: Since this is cumulative it could be misleading in a SPA, e.g. you might cross the threshold from
   *  good -> bad on Page 3 but the largest contributor to your score might have actually occurred on Page 1
   */
  CLS: onCLS,

  /**
   * First Contentful Paint (FCP)
   * https://web.dev/articles/fcp
   *
   * Measures from first hard page load to when the first "content" (text, image, svg elements, etc.) is rendered
   *
   * Only measured once per page load
   */
  FCP: onFCP,

  /**
   * Largest Contentful Paint (LCP)
   * https://web.dev/articles/lcp
   *
   * Uses heuristics to try and measure when the "main" content has been rendered on the page. Size is a factor, but
   * certain elements that likely represent backgrounds or splash screens are excluded.
   *
   * As the page loads the element considered the largest could change, once the user interacts with the page these
   * entries stop getting reported and the metric is ready
   *
   * Only measured once per page load
   */
  LCP: onLCP,

  /**
   * Interaction to Next Paint (INP)
   * https://web.dev/articles/inp
   *
   * Measures how long it takes from a user interaction until the next paint. The final INP value is the longest
   * interaction observed, ignoring outliers.
   *
   * onINP is always called when the page's visibility state changes to hidden and may be called multiple times for
   * a single page load.
   *
   * Each interaction is not reported even when setting reportAllChanges=true, just when an interaction causes an
   * increase to INP.
   */
  INP: onINP,

  /**
   * Time to First Byte (TTFB)
   * https://web.dev/articles/ttfb
   *
   * Measures the time between the request for a resource and when the first byte of a response begins to arrive.
   */
  TTFB: onTTFB,

  // Omitting onFID since FID (First Input Delay) has been deprecated
  FID: undefined,
} as const;
