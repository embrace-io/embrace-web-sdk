import { resolve } from 'node:path';
import Sonda from 'sonda/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const isDevelopment = process.env.NODE_ENV === 'development';

// Remove type="module" and move script to body for webOS compatibility
function removeModuleType(): Plugin {
  return {
    name: 'remove-module-type',
    transformIndexHtml(html) {
      html = html.replace(
        /<script type="module" crossorigin/g,
        '<script defer crossorigin',
      );
      return html;
    },
  };
}

// webOS-specific config - uses IIFE format instead of ES modules
// to avoid MIME type issues when loading from file:// protocol
export default defineConfig({
  base: './',
  plugins: [Sonda({ enabled: false }), removeModuleType()],
  resolve: {
    alias: {
      ...(isDevelopment && {
        '@embrace-io/web-sdk/react-instrumentation': resolve(
          __dirname,
          '../../src/react-instrumentation/index.ts',
        ),
        '@embrace-io/web-sdk': resolve(__dirname, '../../src/index.ts'),
      }),
    },
  },
  build: {
    minify: false,
    sourcemap: true,
    target: 'chrome87',
    rollupOptions: {
      input: 'index.html',
      output: {
        sourcemapDebugIds: true,
        format: 'iife',
        entryFileNames: 'assets/[name].js',
        inlineDynamicImports: true,
      },
    },
  },
  preview: {
    open: true,
  },
});
