import { resolve } from 'node:path';
import Sonda from 'sonda/vite';
import type { PluginOption } from 'vite';
import { defineConfig } from 'vite';

// Sub-app entries: each is a directory with its own index.html. Their in-app
// routes (e.g. /waterfall/a) are client-side pushState paths with no file on
// disk, so a hard load of one needs to be served that entry's index.html.
const SUB_APPS = [
  'react-router-v5',
  'react-router-v6-declarative',
  'react-router-v6-data',
  'page-load',
  'soft',
  'waterfall',
];

// History fallback: rewrite an extension-less deep path under a sub-app to that
// sub-app's index.html so hard navigations resolve to the right entry (and keep
// their sub-route in the URL). Applied to both the dev and preview servers.
const rewriteDeepLink = (
  req: { url?: string },
  _res: unknown,
  next: () => void,
): void => {
  const path = (req.url ?? '').split('?')[0];
  const app = SUB_APPS.find(
    (name) => path.startsWith(`/${name}/`) && path !== `/${name}/`,
  );
  if (app && !path.slice(1).includes('.')) {
    req.url = `/${app}/`;
  }
  next();
};

const subAppDeepLinkFallback = (): PluginOption => ({
  name: 'sub-app-deep-link-fallback',
  configureServer(server) {
    server.middlewares.use(rewriteDeepLink);
  },
  configurePreviewServer(server) {
    server.middlewares.use(rewriteDeepLink);
  },
});

// Delay endpoints for the page-load demo: /demo-api/<kind>?ms=<delay>. They
// give that page requests slow enough to watch the quiet window open and close.
// A static host (GitHub Pages) has no middleware, so there they 404 straight
// away and the recipes just run faster than their labels say.
const DEMO_API_RESPONSES: Record<string, [contentType: string, body: string]> =
  {
    json: ['application/json', '{"ok":true}'],
    script: ['text/javascript', 'globalThis.__demoWidgetLoaded = true;'],
    image: [
      'image/svg+xml',
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="11" fill="#eeff04"/></svg>',
    ],
  };

const MAX_DEMO_API_DELAY_MS = 10_000;

const serveDemoApi = (
  req: { url?: string },
  res: {
    setHeader: (name: string, value: string) => void;
    end: (body: string) => void;
  },
  next: () => void,
): void => {
  const [path, query] = (req.url ?? '').split('?');
  const marker = path.indexOf('/demo-api/');
  const response =
    marker === -1
      ? undefined
      : DEMO_API_RESPONSES[path.slice(marker + '/demo-api/'.length)];

  if (!response) {
    next();
    return;
  }

  const requested = Number(new URLSearchParams(query).get('ms'));
  const delay = Math.min(
    Number.isFinite(requested) ? Math.max(0, requested) : 0,
    MAX_DEMO_API_DELAY_MS,
  );

  setTimeout(() => {
    const [contentType, body] = response;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  }, delay);
};

const demoApi = (): PluginOption => ({
  name: 'demo-api',
  configureServer(server) {
    server.middlewares.use(serveDemoApi);
  },
  configurePreviewServer(server) {
    server.middlewares.use(serveDemoApi);
  },
});

// Debug collector runs at http://localhost:3001 (started by turbo `with` task).
// To send telemetry to it, set VITE_DATA_URL=http://localhost:3001 in .env.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/embrace-web-sdk/' : '/',
  plugins: [Sonda({ enabled: false }), subAppDeepLinkFallback(), demoApi()],
  server: {
    headers: {
      'Server-Timing': 'db;dur=78,cache;dur=0;desc="HIT",render;dur=163',
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        'react-router-v5': resolve(
          import.meta.dirname,
          'react-router-v5/index.html',
        ),
        'react-router-v6-declarative': resolve(
          import.meta.dirname,
          'react-router-v6-declarative/index.html',
        ),
        'react-router-v6-data': resolve(
          import.meta.dirname,
          'react-router-v6-data/index.html',
        ),
        'page-load': resolve(import.meta.dirname, 'page-load/index.html'),
        soft: resolve(import.meta.dirname, 'soft/index.html'),
        waterfall: resolve(import.meta.dirname, 'waterfall/index.html'),
      },
      output: {
        sourcemapDebugIds: true,
      },
    },
  },
});
