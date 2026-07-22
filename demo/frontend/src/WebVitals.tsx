import { session } from '@embrace-io/web-sdk';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MAIN_THREAD_BLOCK_MS } from '../soft/constants.ts';
import { getCapturedSpans, subscribe } from '../waterfall/telemetryCapture.ts';
import logo from './logo.png';
import type { WebVitalReport } from './webVitalsStore.ts';
import { clear, getSnapshot } from './webVitalsStore.ts';

const METRICS = ['cls', 'lcp', 'inp', 'fcp', 'ttfb'];
const ATTR_EMB_TYPE = 'emb.type';
const SESSION_PART_SPAN_TYPE = 'ux.session_part';
const ATTR_SESSION_PART_ID = 'emb.session_part_id';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

type SessionPartMarker = {
  sessionPartId: string;
  timestampMillis: number;
};

let cachedMarkers: SessionPartMarker[] = [];
let cachedMarkersFromCount = -1;

const getPartMarkers = (): SessionPartMarker[] => {
  const spans = getCapturedSpans();

  if (spans.length !== cachedMarkersFromCount) {
    const derived: SessionPartMarker[] = [];
    cachedMarkersFromCount = spans.length;

    for (const span of spans) {
      if (span.attributes[ATTR_EMB_TYPE] !== SESSION_PART_SPAN_TYPE) {
        continue;
      }

      const sessionPartId = asString(span.attributes[ATTR_SESSION_PART_ID]);

      if (sessionPartId === undefined) {
        continue;
      }

      derived.push({ sessionPartId, timestampMillis: span.startMs });
    }

    cachedMarkers = derived;
  }

  return cachedMarkers;
};

// Return a marker for the in-progress session part. This helps us show markers
// in the timeline for parts that have not closed yet.
const useCurrentPartMarker = (): SessionPartMarker | null => {
  const [marker, setMarker] = useState<SessionPartMarker | null>(null);

  useEffect(() => {
    const userSessionManager = session.getUserSessionManager();

    const updateMarker = () => {
      const sessionPartId = userSessionManager.getSessionPartId();
      const marker = sessionPartId
        ? { sessionPartId, timestampMillis: Date.now() }
        : null;

      setMarker(marker);
    };

    updateMarker();

    const unsubscribeStart =
      userSessionManager.addSessionPartStartedListener(updateMarker);
    const unsubscribeEnd =
      userSessionManager.addSessionPartEndedListener(updateMarker);

    return () => {
      unsubscribeStart();
      unsubscribeEnd();
    };
  }, []);

  return marker;
};

type TimelineRow =
  | {
      kind: 'part';
      key: string;
      timestampMillis: number;
      sessionPartId: string;
    }
  | {
      kind: 'vital';
      key: string;
      timestampMillis: number;
      report: WebVitalReport;
    };

const buildTimeline = (
  reports: WebVitalReport[],
  markers: SessionPartMarker[],
): TimelineRow[] => {
  const rows: TimelineRow[] = [
    ...markers.map((marker) => ({
      kind: 'part' as const,
      key: `part-${marker.sessionPartId}`,
      timestampMillis: marker.timestampMillis,
      sessionPartId: marker.sessionPartId,
    })),

    ...reports.map((report) => ({
      kind: 'vital' as const,
      key: `vital-${report.id}`,
      timestampMillis: report.timestampMillis,
      report,
    })),
  ];

  return rows.sort(
    (a, b) =>
      b.timestampMillis - a.timestampMillis ||
      (a.kind === 'part' ? 0 : 1) - (b.kind === 'part' ? 0 : 1),
  );
};

const formatValue = (metric: string, value: number): string => {
  if (metric === 'cls') {
    return value.toFixed(3);
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`;
  }

  return `${Math.round(value)} ms`;
};

const ratingClass = (rating: string): string => {
  switch (rating) {
    case 'good':
      return 'vital-rating vital-rating-good';

    case 'needs-improvement':
      return 'vital-rating vital-rating-needs-improvement';

    case 'poor':
      return 'vital-rating vital-rating-poor';

    default:
      return 'vital-rating';
  }
};

const latestFor = (
  reports: WebVitalReport[],
  metric: string,
): WebVitalReport | undefined => {
  for (let index = reports.length - 1; index >= 0; index -= 1) {
    if (reports[index].metric === metric) {
      return reports[index];
    }
  }

  return undefined;
};

const WebVitals = () => {
  const currentPartMarker = useCurrentPartMarker();
  const reports = useSyncExternalStore(subscribe, getSnapshot);
  const partMarkers = useSyncExternalStore(subscribe, getPartMarkers);

  const [clsBannerVisible, setClsBannerVisible] = useState(false);
  const [largeImageVisible, setLargeImageVisible] = useState(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear all timeouts on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current;

    return () => {
      for (const id of timeouts) {
        clearTimeout(id);
      }
    };
  }, []);

  const setBoolAfterTimeout = (setter: (value: boolean) => void) => () => {
    const insertId = setTimeout(() => {
      setter(true);
      const removeId = setTimeout(() => setter(false), 1500);
      timeoutsRef.current.push(removeId);
    }, 600);

    timeoutsRef.current.push(insertId);
  };

  const triggerLayoutShift = setBoolAfterTimeout(setClsBannerVisible);
  const insertLargeImage = setBoolAfterTimeout(setLargeImageVisible);

  const blockMainThread = () => {
    const end = performance.now() + MAIN_THREAD_BLOCK_MS;

    while (performance.now() < end) {
      // Intentionally spin to hold the main thread.
    }
  };

  const trackedIds = new Set(partMarkers.map((m) => m.sessionPartId));
  const currentPartIsTracked = trackedIds.has(
    currentPartMarker?.sessionPartId ?? '',
  );

  // While the current part is in-progress it won't be in our list of tracked
  // markers, so we manually insert it into the timeline.
  const allMarkers =
    !currentPartIsTracked && currentPartMarker
      ? [...partMarkers, currentPartMarker]
      : partMarkers;

  const timeline = buildTimeline(reports, allMarkers);

  return (
    <fieldset style={{ gridColumn: '1 / -1' }}>
      <legend>Web Vitals</legend>

      <p>
        <small>
          <b>Note:</b> INP and CLS are only reported when the tab is hidden. LCP
          only counts paints from the page load or the navigating interaction,
          so the image button below only affects the initial page load (and only
          before the first interaction). For soft navigation LCP use the Delayed
          LCP page.
        </small>
      </p>

      <div className="actions">
        <button
          type="button"
          onClick={triggerLayoutShift}
          data-testid="trigger-layout-shift"
        >
          Trigger layout shift (CLS)
        </button>
        <button
          type="button"
          onClick={blockMainThread}
          data-testid="block-main-thread"
        >
          Block main thread (INP)
        </button>
        <button
          type="button"
          onClick={insertLargeImage}
          data-testid="insert-large-image"
        >
          Insert large image (LCP)
        </button>
        <button type="button" onClick={clear}>
          Clear
        </button>
      </div>

      {clsBannerVisible ? (
        <div className="cls-banner">
          Layout shift banner — this pushes the content below it down.
        </div>
      ) : null}

      <div className="vitals-tiles">
        {METRICS.map((metric) => {
          const latest = latestFor(reports, metric);
          const count = reports.filter((r) => r.metric === metric).length;

          return (
            <div className="vital-tile" key={metric}>
              <dl className="info-list">
                <dt>{metric.toUpperCase()}</dt>
                <dd>{latest ? formatValue(metric, latest.value) : '—'}</dd>
              </dl>
              {latest && (
                <span className={ratingClass(latest.rating)}>
                  {latest.rating}
                </span>
              )}
              <span className="vital-count">
                {count} report{count === 1 ? '' : 's'}
              </span>
            </div>
          );
        })}
      </div>

      {largeImageVisible ? (
        <img
          src={logo}
          alt="Large logo for LCP"
          style={{ width: '100%', maxWidth: '640px', display: 'block' }}
        />
      ) : null}

      {reports.length > 0 && (
        <table className="session-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Metric</th>
              <th>Value</th>
              <th>Rating</th>
              <th>Nav type</th>
              <th>Nav ID</th>
              <th>Interaction ID</th>
              <th>Page path</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((row) =>
              row.kind === 'part' ? (
                <tr className="vital-part-separator" key={row.key}>
                  <th>{new Date(row.timestampMillis).toLocaleTimeString()}</th>
                  <th colSpan={7} title={row.sessionPartId}>
                    New session part {row.sessionPartId.slice(0, 8)}
                  </th>
                </tr>
              ) : (
                <tr key={row.key}>
                  <td>
                    {new Date(row.report.timestampMillis).toLocaleTimeString()}
                  </td>
                  <td>{row.report.metric.toUpperCase()}</td>
                  <td>{formatValue(row.report.metric, row.report.value)}</td>
                  <td>
                    <span className={ratingClass(row.report.rating)}>
                      {row.report.rating}
                    </span>
                  </td>
                  <td>{row.report.navigationType}</td>
                  <td>{row.report.navigationId ?? '—'}</td>
                  <td>{row.report.interactionId ?? '—'}</td>
                  <td>{row.report.pagePath ?? row.report.url}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </fieldset>
  );
};

export { WebVitals };
