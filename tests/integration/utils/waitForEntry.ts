import type { Page } from 'playwright';

const DEFAULT_TIMEOUT_MS = 10_000;

type WaitForEntryOptions = {
  /**
   * Only count entries whose contentful paint element has this tag, e.g. 'IMG'.
   *
   * Paint types report a sequence of increasingly large candidates that share a
   * startTime, so a plain count resolves on the first one. The element is read
   * from `element` on largest-contentful-paint, and from the nested
   * `largestContentfulPaint` on interaction-contentful-paint, which is the only
   * place a soft navigation's candidate exposes it.
   */
  elementTag?: string;
  timeoutMillis?: number;
};

/**
 * Resolves once the page has observed at least `minimumEntriesNumber` performance
 * entries across `types`.
 *
 * Counting comes from buffered observers rather than `getEntriesByType`, because
 * the types these tests wait on (largest-contentful-paint, layout-shift, event,
 * soft-navigation, interaction-contentful-paint) are observer-only: they are
 * never retained in the queryable timeline, so `getEntriesByType` reports 0 for
 * them even after they have been delivered. Buffering means an entry produced
 * before this is called still counts, so callers do not have to arm it first.
 *
 * Rejects once the timeout elapses so a missing entry fails in seconds with a
 * named error, rather than hanging until the test timeout.
 */
export const waitForEntry = (
  page: Page,
  types: string[],
  minimumEntriesNumber = 1,
  { elementTag, timeoutMillis = DEFAULT_TIMEOUT_MS }: WaitForEntryOptions = {},
) =>
  page.evaluate(
    ({ entryTypes, minimum, tag, timeout }) =>
      new Promise<void>((resolve, reject) => {
        type PaintLike = PerformanceEntry & {
          element?: Element | null;
          largestContentfulPaint?: { element?: Element | null };
        };

        const observers: PerformanceObserver[] = [];
        let seen = 0;

        const disconnectAll = () => {
          for (const observer of observers) {
            observer.disconnect();
          }
        };

        const matches = (entry: PerformanceEntry) => {
          if (tag === null) {
            return true;
          }

          const paint = entry as PaintLike;
          const element =
            paint.element ?? paint.largestContentfulPaint?.element ?? null;

          return element?.tagName === tag;
        };

        const timer = setTimeout(() => {
          disconnectAll();
          reject(
            new Error(
              `expected ${minimum.toString()} ${entryTypes.join('/')} entries${
                tag === null ? '' : ` painting a <${tag.toLowerCase()}>`
              } within ${timeout.toString()}ms, saw ${seen.toString()}`,
            ),
          );
        }, timeout);

        for (const entryType of entryTypes) {
          const observer = new PerformanceObserver((list) => {
            seen += list.getEntries().filter(matches).length;

            if (seen >= minimum) {
              clearTimeout(timer);
              disconnectAll();
              resolve();
            }
          });

          observer.observe(
            // Routers that commit synchronously produce events well under the
            // 104ms default threshold, so they need it lowered to be delivered.
            entryType === 'event'
              ? { type: entryType, buffered: true, durationThreshold: 0 }
              : { type: entryType, buffered: true },
          );
          observers.push(observer);
        }
      }),
    {
      entryTypes: types,
      minimum: minimumEntriesNumber,
      tag: elementTag ?? null,
      timeout: timeoutMillis,
    },
  );
