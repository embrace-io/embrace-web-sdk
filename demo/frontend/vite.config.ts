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

// Debug collector runs at http://localhost:3001 (started by turbo `with` task).
// To send telemetry to it, set VITE_DATA_URL=http://localhost:3001 in .env.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/embrace-web-sdk/' : '/',
  plugins: [Sonda({ enabled: false }), subAppDeepLinkFallback()],
  server: {
    headers: {
      'Server-Timing': 'db;dur=78,cache;dur=0;desc="HIT",render;dur=163',
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'react-router-v5': resolve(__dirname, 'react-router-v5/index.html'),
        'react-router-v6-declarative': resolve(
          __dirname,
          'react-router-v6-declarative/index.html',
        ),
        'react-router-v6-data': resolve(
          __dirname,
          'react-router-v6-data/index.html',
        ),
        soft: resolve(__dirname, 'soft/index.html'),
        waterfall: resolve(__dirname, 'waterfall/index.html'),
      },
      output: {
        sourcemapDebugIds: true,
      },
    },
  },
});
