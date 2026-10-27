/// <reference types="vite/client" />
import { page } from '@embrace-io/web-sdk';
import type { Attributes } from '@opentelemetry/api';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { Layout } from '../src/Layout.tsx';
import { setupSDK } from '../src/otel-base.ts';
import type { ActivityEvent, Route } from './recipes.ts';
import {
  IGNORED_URL_PATTERN,
  QUIET_WINDOW_MS,
  RECIPES,
  ROUTES,
  runRecipe,
} from './recipes.ts';

const base = import.meta.env.BASE_URL;

const getRoute = (): Route =>
  ROUTES.find(
    (route) =>
      route !== 'home' && window.location.pathname.endsWith(`/${route}`),
  ) ?? 'home';

interface EmittedPageLoad {
  id: number;
  type: string;
  duration: number;
  at: number;
  attributes: Attributes;
}

// The applyCustomAttributesOnLog hook runs synchronously as each page-load log
// is created, which doubles as the quickest way to show them on the page: the
// SDK's exporters sit behind a batch processor and would lag by seconds.
const emitted: EmittedPageLoad[] = [];
const emittedListeners = new Set<() => void>();
let emittedCount = 0;
let currentRoute: Route = getRoute();

const subscribeEmitted = (listener: () => void): (() => void) => {
  emittedListeners.add(listener);
  return () => {
    emittedListeners.delete(listener);
  };
};

setupSDK([], [], [], {
  'page-load': {
    // The "Ignored request" recipe tags its long-lived request with ?ignored=1.
    ignoreUrls: [IGNORED_URL_PATTERN],
    applyCustomAttributesOnLog: ({ type, duration }) => {
      const attributes: Attributes = {
        'demo.recipe': currentRoute,
        'demo.path': window.location.pathname,
      };

      emitted.push({
        id: ++emittedCount,
        type,
        duration,
        at: Date.now(),
        attributes,
      });
      // Deferred so a render error can't surface as a failure of the hook,
      // which the SDK would report as the hook throwing.
      queueMicrotask(() => {
        for (const listener of emittedListeners) {
          listener();
        }
      });

      return attributes;
    },
  },
});

const formatAttributes = (attributes: Attributes): string =>
  Object.entries(attributes)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');

const ActivityTable = ({ events }: { events: ActivityEvent[] }) => {
  if (events.length === 0) {
    return <p>This recipe does nothing — the view settles on its own.</p>;
  }

  return (
    <table className="session-table">
      <thead>
        <tr>
          <th scope="col">Offset</th>
          <th scope="col">Phase</th>
          <th scope="col">Kind</th>
          <th scope="col">Step</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={`${event.stepIndex}-${event.phase}`}>
            <td>t+{event.at}ms</td>
            <td>{event.phase}</td>
            <td>{event.kind}</td>
            <td>{event.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const EmittedTable = ({ logs }: { logs: EmittedPageLoad[] }) => {
  if (logs.length === 0) {
    return <p>No page-load log yet — the current view is still loading.</p>;
  }

  return (
    <table className="session-table">
      <thead>
        <tr>
          <th scope="col">Emitted</th>
          <th scope="col">page_load.type</th>
          <th scope="col">page_load.duration</th>
          <th scope="col">Hook attributes</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((entry) => (
          <tr key={entry.id}>
            <td>{new Date(entry.at).toLocaleTimeString()}</td>
            <td>{entry.type}</td>
            <td>{Math.round(entry.duration)}ms</td>
            <td>{formatAttributes(entry.attributes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const App = () => {
  const [route, setRoute] = useState<Route>(getRoute);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [logs, setLogs] = useState<EmittedPageLoad[]>(() => [...emitted]);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeEmitted(() => setLogs([...emitted])), []);

  useEffect(() => {
    const host = stageRef.current;
    if (!host) {
      return;
    }

    host.replaceChildren();
    setActivity([]);

    return runRecipe({
      steps: RECIPES[route].steps,
      host,
      onEvent: (event) => setActivity((previous) => [...previous, event]),
    });
  }, [route]);

  const navigate = (target: Route) => {
    const path = `${base}${RECIPES[target].path}`;
    history.pushState(null, '', path);
    // Report the route explicitly: a browser without the Navigation API has no
    // other way to learn a soft navigation happened, and each page view the
    // instrumentation measures starts from one of these.
    page.setCurrentRoute({
      url: new URL(path, window.location.origin).pathname,
      label: RECIPES[target].title,
    });
    currentRoute = target;
    setRoute(target);
  };

  useEffect(() => {
    const onPopState = () => {
      currentRoute = getRoute();
      setRoute(currentRoute);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const recipe = RECIPES[route];
  const nav = ROUTES.map((target) => (
    <button key={target} type="button" onClick={() => navigate(target)}>
      {RECIPES[target].title}
    </button>
  ));
  const lastActivityAt = activity.reduce(
    (latest, event) => Math.max(latest, event.at),
    0,
  );

  return (
    <>
      <fieldset style={{ gridColumn: '1 / -1' }}>
        <legend>{recipe.title}</legend>
        <div className="nav-buttons">{nav}</div>
        <p>{recipe.description}</p>
        <p>
          Each button soft-navigates to a route that loads differently. The SDK
          emits one <code>page-load</code> log per view, {QUIET_WINDOW_MS}ms
          after the last request finishes and the DOM stops changing — the
          reported duration runs to that last activity, not to the end of the
          quiet window. Navigate again before a view settles and that view is
          abandoned, with no log for it.
        </p>
        <div ref={stageRef} className="page-load-stage" />
      </fieldset>

      <fieldset style={{ gridColumn: '1 / -1' }}>
        <legend>Activity</legend>
        <p>
          What this route loaded, offset from the moment the recipe started.
          {activity.length > 0 && (
            <>
              {' '}
              Last activity at <code>{`t+${lastActivityAt}ms`}</code>, which is
              roughly where <code>page_load.duration</code> should land; the log
              itself follows {QUIET_WINDOW_MS}ms later.
            </>
          )}
        </p>
        <ActivityTable events={activity} />
      </fieldset>

      <fieldset style={{ gridColumn: '1 / -1' }}>
        <legend>Emitted page-load logs</legend>
        <p>
          Read from the <code>applyCustomAttributesOnLog</code> hook as each log
          is created. The full record, attributes and all, is on the console.
        </p>
        <EmittedTable logs={logs} />
      </fieldset>
    </>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  // No StrictMode here, unlike the other demo pages: its double-invoked effects
  // would run every recipe twice in development and double the request counts.
  createRoot(rootElement).render(
    <Layout>
      <App />
    </Layout>,
  );
}
