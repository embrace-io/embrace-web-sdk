// Test page for the e2e-headed specs, which depend on the texts, button
// names, and data-testids here.
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DEFAULT_LCP_DELAY_MS,
  DEFERRED_MAIN_THREAD_BLOCK_DELAY_MS,
  LAYOUT_SHIFT_DELAY_MS,
  MAIN_THREAD_BLOCK_MS,
} from './constants.ts';
import logo from './logo.png';
import './otel.ts';

type Route = 'home' | 'a' | 'b' | 'lcp';

const PAGES: Record<
  Route,
  { path: string; title: string; description: string }
> = {
  home: {
    path: '/',
    title: 'Home',
    description:
      'This is the landing page. Click a button above to navigate via history.pushState() without a full page reload.',
  },
  a: {
    path: '/a',
    title: 'Page A',
    description: 'You navigated to Page A via a soft navigation.',
  },
  b: {
    path: '/b',
    title: 'Page B',
    description: 'You navigated to Page B via a soft navigation.',
  },
  lcp: {
    path: `/lcp?delay=${DEFAULT_LCP_DELAY_MS}`,
    title: 'Delayed LCP',
    description:
      'This page renders a large image after the delay given by the ?delay query param, making the image the LCP of this soft navigation.',
  },
};

const getRoute = (): Route => {
  const { pathname } = window.location;
  if (pathname.endsWith('/a')) return 'a';
  if (pathname.endsWith('/b')) return 'b';
  if (pathname.endsWith('/lcp')) return 'lcp';
  return 'home';
};

const DelayedLcpImage = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const delay =
      Number(new URLSearchParams(window.location.search).get('delay')) ||
      DEFAULT_LCP_DELAY_MS;
    const timeout = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timeout);
  }, []);

  return visible ? (
    <img
      src={logo}
      alt="Large logo for delayed LCP"
      style={{ width: '100%', maxWidth: '640px', display: 'block' }}
    />
  ) : null;
};

const App = () => {
  const [route, setRoute] = useState<Route>(getRoute);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [scheduledBlockCount, setScheduledBlockCount] = useState(0);
  const [deferredBlockCount, setDeferredBlockCount] = useState(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const onPopState = () => setRoute(getRoute());
    window.addEventListener('popstate', onPopState);
    const timeouts = timeoutsRef.current;
    return () => {
      window.removeEventListener('popstate', onPopState);
      for (const id of timeouts) {
        clearTimeout(id);
      }
    };
  }, []);

  const navigate = (target: Route) => {
    history.pushState(null, '', PAGES[target].path);
    setRoute(target);
  };

  const blockMainThread = () => {
    const end = performance.now() + MAIN_THREAD_BLOCK_MS;

    while (performance.now() < end) {
      // Spin to hold the main thread.
    }
  };

  // A block in the click's animation frame is excluded from TBD, so defer it
  // and repaint first (via the scheduled counter) to close the click's frame.
  const blockMainThreadDeferred = () => {
    setScheduledBlockCount((count) => count + 1);

    const id = setTimeout(() => {
      blockMainThread();
      setDeferredBlockCount((count) => count + 1);
    }, DEFERRED_MAIN_THREAD_BLOCK_DELAY_MS);

    timeoutsRef.current.push(id);
  };

  const triggerLayoutShift = () => {
    const id = setTimeout(() => setBannerVisible(true), LAYOUT_SHIFT_DELAY_MS);

    timeoutsRef.current.push(id);
  };

  const page = PAGES[route];
  const nav = (Object.keys(PAGES) as Route[]).map((target) => (
    <button key={target} type="button" onClick={() => navigate(target)}>
      {PAGES[target].title}
    </button>
  ));

  return (
    <main>
      <fieldset>
        <legend>{page.title}</legend>
        <div>{nav}</div>
        <p>{page.description}</p>
        {route === 'lcp' && <DelayedLcpImage />}
      </fieldset>

      {bannerVisible ? (
        <div style={{ padding: '2rem', background: '#fde68a' }}>
          Layout shift banner — this pushes the content below it down.
        </div>
      ) : null}

      <fieldset>
        <legend>Triggers</legend>
        <div>
          <button
            type="button"
            onClick={blockMainThread}
            data-testid="block-main-thread"
          >
            Block main thread
          </button>
          <button
            type="button"
            onClick={blockMainThreadDeferred}
            data-testid="block-main-thread-deferred"
          >
            Block main thread later
          </button>
          <button
            type="button"
            onClick={triggerLayoutShift}
            data-testid="trigger-layout-shift"
          >
            Trigger layout shift
          </button>
        </div>
        <p>
          Deferred blocks completed:{' '}
          <span data-testid="deferred-block-count">{deferredBlockCount}</span>{' '}
          of {scheduledBlockCount} scheduled
        </p>
      </fieldset>
    </main>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
