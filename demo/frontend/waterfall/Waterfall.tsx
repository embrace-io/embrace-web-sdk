/** biome-ignore-all lint/a11y/noNoninteractiveElementInteractions: spans are interactive */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: spans are interactive */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: demo-only debug view, mouse-driven */
import { useEffect, useRef, useState } from 'react';
import type { CapturedLog, CapturedSpan } from './telemetryCapture.ts';
import {
  clearCapture,
  getCapturedLogs,
  getCapturedSpans,
  subscribe,
} from './telemetryCapture.ts';

const ROW_HEIGHT = 26;
const LOG_LANE_HEIGHT = 28;
// When zoomed, the viewport shows this many milliseconds; the rest of the
// timeline overflows horizontally and is reached by scrolling.
const ZOOM_WINDOW_MS = 1500;

const SEVERITY_COLOR: Record<string, string> = {
  error: '#f87171',
  fatal: '#f87171',
  warning: '#fbbf24',
  warn: '#fbbf24',
  info: '#60a5fa',
};

const logColor = (severityText: string): string =>
  SEVERITY_COLOR[severityText.toLowerCase()] ?? '#a1a1aa';

// Brand green (the Embrace accent). Other span types get hues rotated from it
// by the golden angle so each type is distinct but stays in the same family.
const SEED_HEX = '#eeff04';
const SEED_HUE = 64; // HSL hue of #eeff04
const GOLDEN_ANGLE = 137.508;

const hslToHex = (h: number, s: number, l: number): string => {
  const sN = s / 100;
  const lN = l / 100;
  const a = sN * Math.min(lN, 1 - lN);
  const channel = (n: number): string => {
    const k = (n + h / 30) % 12;
    const value = lN - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

// Color by span type (emb.type) so all spans of a kind share a color: every
// React user-timing span one color, every resource fetch another, etc. Session
// part spans get the brand green. Untyped spans (e.g. soft nav) fall back to
// their name so they still get a stable color.
const spanColor = (span: CapturedSpan): string => {
  const embType = span.attributes['emb.type'];
  if (embType === 'ux.session_part') {
    return SEED_HEX;
  }
  const typeKey = typeof embType === 'string' ? embType : span.name;
  const hue = (SEED_HUE + (hashString(typeKey) + 1) * GOLDEN_ANGLE) % 360;
  return hslToHex(hue, 70, 62);
};

// Dark text on light fills, light text on dark ones, by perceived luminance.
const textOn = (hex: string): string => {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#09090b' : '#e4e4e7';
};

// document-load emits these on the initial hard load only (one resourceFetch per
// subresource). They never recur on a soft navigation, so hiding them by default
// keeps the soft-nav picture readable.
const NETWORK_SPAN_NAMES = new Set([
  'resourcefetch',
  'documentfetch',
  'documentload',
]);

const isNetworkSpan = (name: string): boolean => {
  const lower = name.toLowerCase();
  return lower.startsWith('http ') || NETWORK_SPAN_NAMES.has(lower);
};

// Positions everything against a shared [minMs, maxMs] domain so spans and logs
// line up in time. Returns null when there is nothing to draw. Folds min/max in
// a loop rather than spreading into Math.min/max, which throws on large inputs
// (the capture arrays grow unbounded until Clear).
const useDomain = (spans: CapturedSpan[], logs: CapturedLog[]) => {
  if (spans.length === 0 && logs.length === 0) {
    return null;
  }
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  const track = (value: number) => {
    if (value < minMs) minMs = value;
    if (value > maxMs) maxMs = value;
  };
  for (const span of spans) {
    track(span.startMs);
    track(span.endMs);
  }
  for (const log of logs) {
    track(log.timeMs);
  }
  const rangeMs = Math.max(maxMs - minMs, 1);
  return { minMs, rangeMs };
};

const pct = (value: number): string => `${value * 100}%`;

interface Tip {
  title: string;
  lines: string[];
  x: number;
  y: number;
}

const Waterfall = () => {
  const [, forceRender] = useState(0);
  const [hideNetwork, setHideNetwork] = useState(true);
  const [tip, setTip] = useState<Tip | null>(null);
  // When zoomed, the timeline is rendered wider than the viewport at a fixed
  // scale (ZOOM_WINDOW_MS across the viewport) and scrolls horizontally.
  const [zoomed, setZoomed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToMsRef = useRef<number | null>(null);

  useEffect(() => subscribe(() => forceRender((n) => n + 1)), []);

  const allSpans = [...getCapturedSpans()].sort(
    (a, b) => a.startMs - b.startMs,
  );
  const spans = hideNetwork
    ? allSpans.filter((span) => !isNetworkSpan(span.name))
    : allSpans;
  const logs = [...getCapturedLogs()];
  const hiddenCount = allSpans.length - spans.length;
  // Positions are always computed against the full extent; zoom only stretches
  // the inner content width and lets it scroll.
  const domain = useDomain(spans, logs);
  const innerWidthPct =
    zoomed && domain
      ? Math.max((domain.rangeMs / ZOOM_WINDOW_MS) * 100, 100)
      : 100;

  const ticks: number[] = [];
  if (domain) {
    // Aim for ~5 ticks across the zoomed viewport; coarser when showing it all.
    // Floor the step so a long timeline can't produce thousands of labels.
    const baseStep = zoomed
      ? ZOOM_WINDOW_MS / 5
      : Math.max(Math.round(domain.rangeMs / 6), 1);
    const tickStepMs = Math.max(baseStep, domain.rangeMs / 150);
    for (let t = 0; t <= domain.rangeMs; t += tickStepMs) {
      ticks.push(t);
    }
  }

  // After a zoom-to-span, scroll so the requested time is centered.
  useEffect(() => {
    const target = scrollToMsRef.current;
    scrollToMsRef.current = null;
    const el = scrollRef.current;
    if (target == null || el == null || domain == null) {
      return;
    }
    const fraction = (target - domain.minMs) / domain.rangeMs;
    el.scrollLeft = fraction * el.scrollWidth - el.clientWidth / 2;
  });

  const clearTip = () => setTip(null);
  // A short span (a soft nav can be ~30 ms) is a hairline at full scale. Clicking
  // it turns on the fixed ZOOM_WINDOW_MS scale and centers the view on the span.
  const zoomToSpan = (span: CapturedSpan) => {
    scrollToMsRef.current = (span.startMs + span.endMs) / 2;
    setZoomed(true);
  };
  const resetZoom = () => setZoomed(false);
  const handleClear = () => {
    setZoomed(false);
    clearCapture();
  };
  const showSpanTip = (
    span: CapturedSpan,
    e: { clientX: number; clientY: number },
  ) => {
    setTip({
      title: span.name,
      lines: [
        `${(span.endMs - span.startMs).toFixed(1)} ms`,
        domain ? `start +${(span.startMs - domain.minMs).toFixed(0)} ms` : '',
        domain ? `end +${(span.endMs - domain.minMs).toFixed(0)} ms` : '',
        `spanId ${span.spanId}`,
        'click to zoom',
      ].filter(Boolean),
      x: e.clientX,
      y: e.clientY,
    });
  };
  const showLogTip = (
    log: CapturedLog,
    e: { clientX: number; clientY: number },
  ) => {
    setTip({
      title: log.eventName ?? log.embType ?? log.severityText,
      lines: [
        log.body || '(empty body)',
        `severity ${log.severityText}`,
        domain ? `+${(log.timeMs - domain.minMs).toFixed(0)} ms` : '',
      ].filter(Boolean),
      x: e.clientX,
      y: e.clientY,
    });
  };

  // Near the right/bottom third of the viewport, open the tooltip toward the
  // opposite side of the cursor so it doesn't run off the edge.
  const tipOpensLeft = tip !== null && tip.x > window.innerWidth * (2 / 3);
  const tipOpensUp = tip !== null && tip.y > window.innerHeight * (2 / 3);

  return (
    <fieldset style={{ gridColumn: '1 / -1' }}>
      <legend>Waterfall</legend>
      <div className="nav-buttons" style={{ marginBottom: '0.75rem' }}>
        <button type="button" onClick={handleClear}>
          Clear
        </button>
        {zoomed ? (
          <button type="button" onClick={resetZoom}>
            Reset zoom
          </button>
        ) : null}
        <label style={{ alignSelf: 'center', color: '#a1a1aa' }}>
          <input
            type="checkbox"
            checked={hideNetwork}
            onChange={(e) => setHideNetwork(e.target.checked)}
          />{' '}
          Hide network spans
        </label>
        <span style={{ alignSelf: 'center', color: '#a1a1aa' }}>
          {spans.length} spans
          {hiddenCount > 0 ? ` (+${hiddenCount} hidden)` : ''} · {logs.length}{' '}
          logs
        </span>
      </div>

      {domain === null ? (
        <p style={{ color: '#a1a1aa' }}>
          Nothing captured yet. Navigate between pages and emit logs; spans
          flush when a session part ends (on each soft navigation).
        </p>
      ) : (
        <div
          ref={scrollRef}
          style={{
            position: 'relative',
            overflowX: zoomed ? 'auto' : 'hidden',
            overflowY: 'hidden',
          }}
        >
          <div style={{ position: 'relative', width: `${innerWidthPct}%` }}>
            {zoomed ? (
              <div
                style={{
                  color: '#a1a1aa',
                  fontSize: '0.72rem',
                  marginBottom: 4,
                }}
              >
                {ZOOM_WINDOW_MS / 1000}s window, scroll horizontally to pan
              </div>
            ) : null}

            {/* Span rows */}
            <div
              style={{
                position: 'relative',
                height: spans.length * ROW_HEIGHT,
              }}
            >
              {/* Vertical guide line per log, spanning the span rows */}
              {logs.map((log) => (
                <div
                  key={`guide-${log.uid}-${log.timeMs}`}
                  onMouseMove={(e) => showLogTip(log, e)}
                  onMouseLeave={clearTip}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: pct((log.timeMs - domain.minMs) / domain.rangeMs),
                    width: 1,
                    background: logColor(log.severityText),
                    opacity: 0.35,
                  }}
                />
              ))}
              {spans.map((span, i) => {
                const left = (span.startMs - domain.minMs) / domain.rangeMs;
                const width = (span.endMs - span.startMs) / domain.rangeMs;
                const background = spanColor(span);
                return (
                  <div
                    key={`${span.spanId}-${span.startMs}`}
                    onMouseMove={(e) => showSpanTip(span, e)}
                    onMouseLeave={clearTip}
                    onClick={() => zoomToSpan(span)}
                    style={{
                      position: 'absolute',
                      top: i * ROW_HEIGHT,
                      height: ROW_HEIGHT - 4,
                      left: pct(left),
                      width: pct(width),
                      minWidth: 3,
                      cursor: 'pointer',
                      background,
                      color: textOn(background),
                      borderRadius: 3,
                      fontSize: '0.72rem',
                      lineHeight: `${ROW_HEIGHT - 4}px`,
                      paddingLeft: 4,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      boxSizing: 'border-box',
                    }}
                  >
                    {span.name}
                  </div>
                );
              })}
            </div>

            {/* Log lane */}
            <div
              style={{
                position: 'relative',
                height: LOG_LANE_HEIGHT,
                borderTop: '1px solid #3f3f46',
                marginTop: 4,
              }}
            >
              {logs.map((log) => (
                <div
                  key={`dot-${log.uid}-${log.timeMs}`}
                  onMouseMove={(e) => showLogTip(log, e)}
                  onMouseLeave={clearTip}
                  style={{
                    position: 'absolute',
                    top: LOG_LANE_HEIGHT / 2 - 6,
                    left: pct((log.timeMs - domain.minMs) / domain.rangeMs),
                    width: 12,
                    height: 12,
                    marginLeft: -6,
                    borderRadius: '50%',
                    background: logColor(log.severityText),
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>

            {/* Time axis */}
            <div style={{ position: 'relative', height: 16, marginTop: 4 }}>
              {ticks.map((t) => (
                <span
                  key={t}
                  style={{
                    position: 'absolute',
                    left: pct(t / domain.rangeMs),
                    color: '#a1a1aa',
                    fontSize: '0.72rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.toFixed(0)} ms
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {tip ? (
        <div
          style={{
            position: 'fixed',
            left: tipOpensLeft ? undefined : tip.x + 14,
            right: tipOpensLeft ? window.innerWidth - tip.x + 14 : undefined,
            top: tipOpensUp ? undefined : tip.y + 14,
            bottom: tipOpensUp ? window.innerHeight - tip.y + 14 : undefined,
            pointerEvents: 'none',
            zIndex: 1000,
            maxWidth: 360,
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid #3f3f46',
            background: '#18181b',
            color: '#e4e4e7',
            fontSize: '0.72rem',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>
            {tip.title}
          </div>
          {tip.lines.map((line) => (
            <div
              key={line}
              style={{
                color: '#a1a1aa',
                wordBreak: 'break-word',
                fontStyle: line === 'click to zoom' ? 'italic' : undefined,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
};

export { Waterfall };
