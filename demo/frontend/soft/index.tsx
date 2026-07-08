/// <reference types="vite/client" />
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { Layout } from '../src/Layout.tsx';
import { NavPage } from '../src/NavPage.tsx';
import { setupSDK } from '../src/otel-base.ts';

setupSDK();

type Route = 'home' | 'a' | 'b' | 'query' | 'hash';

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
      'You navigated to Page A. The URL changed but the page was not reloaded — this is a soft navigation.',
  },
  b: {
    path: 'soft/b',
    title: 'Page B',
    description:
      'You navigated to Page B. Check the Navigation Info below to see how the SDK tracks this.',
  },
  query: {
    path: 'soft/?tab=details',
    title: 'Query String',
    description:
      'Only the query string changed (?tab=details). Tests whether the SDK treats a search-param-only change as a soft navigation.',
  },
  hash: {
    path: 'soft/#section',
    title: 'Hash',
    description:
      'Only the hash changed (#section). Tests whether the SDK treats a hash-only change as a soft navigation.',
  },
};

const getRoute = (): Route => {
  const { pathname, search, hash } = window.location;
  if (pathname.endsWith('/a')) return 'a';
  if (pathname.endsWith('/b')) return 'b';
  if (search.includes('tab=details')) return 'query';
  if (hash.includes('section')) return 'hash';
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
    <NavPage title={page.title} nav={nav}>
      <p>{page.description}</p>
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
