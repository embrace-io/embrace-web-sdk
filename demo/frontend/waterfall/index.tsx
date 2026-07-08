/// <reference types="vite/client" />
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { log } from '@embrace-io/web-sdk';
import { Layout } from '../src/Layout.tsx';
import { NavPage } from '../src/NavPage.tsx';
import { setupSDK } from '../src/otel-base.ts';
import {
  CapturingLogExporter,
  CapturingSpanExporter,
} from './telemetryCapture.ts';
import { Waterfall } from './Waterfall.tsx';

setupSDK([], [new CapturingSpanExporter()], [new CapturingLogExporter()]);

const emitLog = (severity: 'info' | 'warning' | 'error') => {
  log.getLogManager().message(`Waterfall demo ${severity} log`, severity, {
    attributes: { source: 'waterfall-demo' },
  });
};

type Route = 'home' | 'a' | 'b';

const PAGES: Record<
  Route,
  { path: string; title: string; description: string }
> = {
  home: {
    path: 'waterfall/',
    title: 'Home',
    description:
      'Click a nav button to soft-navigate (history.pushState), or emit a log, and watch both appear on the waterfall below. Click a span to zoom in.',
  },
  a: {
    path: 'waterfall/a',
    title: 'Page A',
    description:
      'You soft-navigated to Page A. The URL changed without a full page reload, which rolls the session part.',
  },
  b: {
    path: 'waterfall/b',
    title: 'Page B',
    description:
      'You soft-navigated to Page B. Emit some logs, then click the soft-nav span to see the overlap.',
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

  const navigate = (target: Route) => {
    history.pushState(null, '', `${base}${PAGES[target].path}`);
    setRoute(target);
  };

  useEffect(() => {
    const onPopState = () => setRoute(getRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const page = PAGES[route];
  const nav = (Object.keys(PAGES) as Route[]).map((r) => (
    <button key={r} type="button" onClick={() => navigate(r)}>
      {PAGES[r].title}
    </button>
  ));

  return (
    <>
      <NavPage title={page.title} nav={nav}>
        <p>{page.description}</p>
        <div className="nav-buttons">
          <button type="button" onClick={() => emitLog('info')}>
            Emit info log
          </button>
          <button type="button" onClick={() => emitLog('warning')}>
            Emit warning log
          </button>
          <button type="button" onClick={() => emitLog('error')}>
            Emit error log
          </button>
        </div>
      </NavPage>
      <Waterfall />
    </>
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
