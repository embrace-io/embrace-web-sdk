/// <reference types="vite/client" />

// Load recipes for the page-load demo. Each route kicks off a different mix of
// fetch, XHR, browser-initiated resource loads and DOM mutations so the
// PageLoadInstrumentation's quiet-window heuristic can be watched end to end.
//
// Requests go to /demo-api/*, a delay endpoint served by the Vite dev and
// preview servers (see vite.config.ts). On a static host those 404 immediately,
// so the recipes still run, just much faster than the labels suggest.

// Mirrors PAGE_LOAD_QUIET_WINDOW_MS in the SDK: how long the page must go
// without network or DOM activity before the view counts as loaded. It is a
// confirmation delay only — the duration the SDK reports is measured to the
// moment activity stopped, not to the moment the window expired. Any recipe
// whose own steps are spaced wider than this settles early, on purpose.
export const QUIET_WINDOW_MS = 100;

// Requests tagged with this marker are passed to the instrumentation as
// `ignoreUrls`, so they never hold a page view open.
export const IGNORED_URL_PATTERN = /[?&]ignored=1/;

export type StepKind = 'fetch' | 'xhr' | 'script' | 'img' | 'dom';

export interface Step {
  kind: StepKind;
  label: string;
  /** Milliseconds after the recipe starts before this step is kicked off. Unused when `after` is set. */
  at: number;
  /** Milliseconds the endpoint is asked to stall for, or how long the row drip lasts for `dom`. */
  ms: number;
  /** Index of the step this one waits for, instead of starting at `at`. */
  after?: number;
  /** Rows appended over `ms`. `dom` only. */
  rows?: number;
  /** Tags the request so the instrumentation's `ignoreUrls` leaves it out. */
  ignored?: boolean;
}

export type Route = 'home' | 'mixed' | 'chained' | 'dom' | 'ignored' | 'quiet';

export interface Recipe {
  path: string;
  title: string;
  description: string;
  steps: Step[];
}

export const ROUTES: Route[] = [
  'home',
  'mixed',
  'chained',
  'dom',
  'ignored',
  'quiet',
];

export const RECIPES: Record<Route, Recipe> = {
  home: {
    path: 'page-load/',
    title: 'Initial load',
    description:
      'The hard navigation. This view starts at the time origin and cannot finish before the load event, so its duration covers everything the browser did plus the recipe below.',
    steps: [
      { kind: 'fetch', label: 'fetch /profile', at: 0, ms: 180 },
      { kind: 'xhr', label: 'xhr /settings', at: 40, ms: 260 },
      { kind: 'fetch', label: 'fetch /feed', at: 120, ms: 150 },
      { kind: 'img', label: 'img /avatar', at: 220, ms: 200 },
      { kind: 'script', label: 'script /widget', at: 300, ms: 160 },
      { kind: 'dom', label: 'render 6 rows', at: 380, ms: 480, rows: 6 },
    ],
  },
  mixed: {
    path: 'page-load/mixed',
    title: 'Mixed',
    description:
      'fetch, XHR, an <img> and DOM mutations overlapping. There is a 60ms gap in the middle: shorter than the quiet window, so the view rides through it instead of settling early.',
    steps: [
      { kind: 'fetch', label: 'fetch /profile', at: 0, ms: 200 },
      { kind: 'xhr', label: 'xhr /settings', at: 0, ms: 320 },
      { kind: 'dom', label: 'render 4 rows', at: 80, ms: 240, rows: 4 },
      { kind: 'fetch', label: 'fetch /related', at: 380, ms: 180 },
      { kind: 'img', label: 'img /hero', at: 420, ms: 240 },
      { kind: 'xhr', label: 'xhr /counts', at: 500, ms: 120 },
    ],
  },
  chained: {
    path: 'page-load/chained',
    title: 'Chained',
    description:
      'A dependent waterfall: each request only starts once the previous one resolves. Nothing overlaps, so the duration is the sum of the chain.',
    steps: [
      { kind: 'fetch', label: 'fetch /session', at: 0, ms: 200 },
      { kind: 'xhr', label: 'xhr /profile', at: 0, ms: 200, after: 0 },
      {
        kind: 'dom',
        label: 'render 3 rows',
        at: 0,
        ms: 180,
        rows: 3,
        after: 1,
      },
      {
        kind: 'fetch',
        label: 'fetch /recommendations',
        at: 0,
        ms: 220,
        after: 2,
      },
    ],
  },
  dom: {
    path: 'page-load/dom',
    title: 'DOM only',
    description:
      'No requests at all, just rows appended every 60ms. Patching fetch and XHR would see nothing here; the MutationObserver is what keeps the view open. Space the rows further apart than the quiet window and the view would settle on the first gap instead.',
    steps: [{ kind: 'dom', label: 'render 16 rows', at: 0, ms: 960, rows: 16 }],
  },
  ignored: {
    path: 'page-load/ignored',
    title: 'Ignored request',
    description:
      'A long-lived request tagged ?ignored=1 runs for 3s alongside two normal ones. Because it matches `ignoreUrls`, the view settles with the short requests instead of waiting it out.',
    steps: [
      {
        kind: 'fetch',
        label: 'fetch /live-feed (ignored)',
        at: 0,
        ms: 3000,
        ignored: true,
      },
      { kind: 'fetch', label: 'fetch /profile', at: 0, ms: 180 },
      { kind: 'xhr', label: 'xhr /settings', at: 60, ms: 160 },
    ],
  },
  quiet: {
    path: 'page-load/quiet',
    title: 'Quiet',
    description:
      'A route that does nothing. It is quiet from the moment it starts, so the duration is near zero and the log still lands one quiet window later.',
    steps: [],
  },
};

const ENDPOINT_BY_KIND: Partial<Record<StepKind, string>> = {
  fetch: 'json',
  xhr: 'json',
  script: 'script',
  img: 'image',
};

const base = import.meta.env.BASE_URL;

const stepUrl = (step: Step, nonce: number): string => {
  const params = new URLSearchParams({
    name: step.label,
    ms: String(step.ms),
    // Cache busting: every run has to hit the network for the delay to apply.
    n: String(nonce),
  });
  if (step.ignored) {
    params.set('ignored', '1');
  }
  return `${base}demo-api/${ENDPOINT_BY_KIND[step.kind] ?? 'json'}?${params.toString()}`;
};

export interface ActivityEvent {
  stepIndex: number;
  phase: 'start' | 'end';
  label: string;
  kind: StepKind;
  /** Milliseconds since the recipe started. */
  at: number;
}

interface RunRecipeArgs {
  steps: Step[];
  /** Element the recipe appends its rows, scripts and images to. */
  host: HTMLElement;
  onEvent: (event: ActivityEvent) => void;
}

/** Runs a recipe and returns a cancel function for when the route changes. */
export const runRecipe = ({
  steps,
  host,
  onEvent,
}: RunRecipeArgs): (() => void) => {
  const startedAt = performance.now();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const nonce = Date.now();
  let cancelled = false;

  const later = (run: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!cancelled) {
        run();
      }
    }, ms);
    timers.add(timer);
  };

  const report = (index: number, phase: ActivityEvent['phase']) => {
    if (cancelled) {
      return;
    }
    const step = steps[index];
    onEvent({
      stepIndex: index,
      phase,
      label: step.label,
      kind: step.kind,
      at: Math.round(performance.now() - startedAt),
    });
  };

  const finish = (index: number) => {
    if (cancelled) {
      return;
    }
    report(index, 'end');
    steps.forEach((step, next) => {
      if (step.after === index) {
        begin(next);
      }
    });
  };

  const appendRow = (index: number, remaining: number, every: number) => {
    const step = steps[index];
    const total = step.rows ?? 1;
    const row = document.createElement('div');
    row.className = 'page-load-row';
    row.textContent = `${step.label}: row ${total - remaining + 1} of ${total}`;
    host.appendChild(row);

    if (remaining > 1) {
      later(() => appendRow(index, remaining - 1, every), every);
    } else {
      finish(index);
    }
  };

  function begin(index: number): void {
    if (cancelled) {
      return;
    }
    const step = steps[index];
    report(index, 'start');

    switch (step.kind) {
      case 'dom': {
        const rows = step.rows ?? 1;
        appendRow(index, rows, Math.max(1, Math.round(step.ms / rows)));
        break;
      }
      case 'fetch': {
        void fetch(stepUrl(step, nonce))
          .catch(() => undefined)
          .finally(() => finish(index));
        break;
      }
      case 'xhr': {
        const request = new XMLHttpRequest();
        request.addEventListener('loadend', () => finish(index));
        request.open('GET', stepUrl(step, nonce));
        request.send();
        break;
      }
      case 'script': {
        const element = document.createElement('script');
        element.addEventListener('load', () => finish(index));
        element.addEventListener('error', () => finish(index));
        element.src = stepUrl(step, nonce);
        host.appendChild(element);
        break;
      }
      case 'img': {
        const element = document.createElement('img');
        element.alt = step.label;
        element.width = 24;
        element.height = 24;
        element.addEventListener('load', () => finish(index));
        element.addEventListener('error', () => finish(index));
        element.src = stepUrl(step, nonce);
        host.appendChild(element);
        break;
      }
    }
  }

  steps.forEach((step, index) => {
    if (step.after === undefined) {
      later(() => begin(index), step.at);
    }
  });

  return () => {
    cancelled = true;
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
  };
};
