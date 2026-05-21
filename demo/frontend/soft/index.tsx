/// <reference types="vite/client" />
import type { SoftNavigationDetail } from '@embrace-io/web-sdk';
import { SOFT_NAVIGATION_EVENT } from '@embrace-io/web-sdk';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { createReactRouterNavigationInstrumentation } from '@embrace-io/web-sdk/react-instrumentation';
import { Layout } from '../src/Layout.tsx';
import { NavPage } from '../src/NavPage.tsx';
import { setupSDK } from '../src/otel-base.ts';

setupSDK([createReactRouterNavigationInstrumentation()]);

type Route = 'home' | 'a' | 'b';

const PAGES: Record<
  Route,
  { path: string; title: string; description: string }
> = {
  home: {
    path: 'soft/',
    title: 'Home',
    description:
      'This is the landing page. Click a button above to navigate via history.pushState() without a full page reload.',
  },
  a: {
    path: 'soft/a',
    title: 'Page A',
    description:
      'You navigated to Page A. The URL changed but the page was not reloaded; this is a soft navigation.',
  },
  b: {
    path: 'soft/b',
    title: 'Page B',
    description:
      'You navigated to Page B. Check the Navigation Info below to see how the SDK tracks this.',
  },
};

const getRoute = (): Route => {
  const path = window.location.pathname;
  if (path.endsWith('/a')) return 'a';
  if (path.endsWith('/b')) return 'b';
  return 'home';
};

const base = import.meta.env.BASE_URL;

const App = () => {
  const [route, setRoute] = useState<Route>(getRoute);
  const [lastSoftNav, setLastSoftNav] = useState<SoftNavigationDetail | null>(
    null,
  );

  const navigate = (target: Route) => {
    history.pushState(null, '', `${base}${PAGES[target].path}`);
    setRoute(target);
  };

  useEffect(() => {
    const onPopState = () => setRoute(getRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onSoftNav = (event: CustomEvent<SoftNavigationDetail>) => {
      setLastSoftNav(event.detail);
    };
    window.addEventListener(SOFT_NAVIGATION_EVENT, onSoftNav);
    return () => window.removeEventListener(SOFT_NAVIGATION_EVENT, onSoftNav);
  }, []);

  const page = PAGES[route];
  const nav = (Object.keys(PAGES) as Route[]).map((r) => (
    <button key={r} type="button" onClick={() => navigate(r)}>
      {PAGES[r].title}
    </button>
  ));

  return (
    <NavPage title={page.title} nav={nav}>
      <p>{page.description}</p>
      <fieldset>
        <legend>Last soft navigation</legend>
        {lastSoftNav ? (
          <dl className="info-list">
            <dt>URL</dt>
            <dd>{lastSoftNav.url}</dd>
            <dt>Previous URL</dt>
            <dd>{lastSoftNav.previousUrl}</dd>
            <dt>Start time</dt>
            <dd>{lastSoftNav.startTime.toFixed(2)} ms</dd>
            <dt>Paint time</dt>
            <dd>{lastSoftNav.paintTime.toFixed(2)} ms</dd>
            <dt>Navigation ID</dt>
            <dd>{lastSoftNav.navigationId}</dd>
          </dl>
        ) : (
          <p>Click a navigation button to trigger a soft navigation.</p>
        )}
      </fieldset>
    </NavPage>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <Layout>
        <App />
      </Layout>
    </StrictMode>,
  );
}
