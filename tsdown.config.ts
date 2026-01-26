import { defineConfig } from 'tsdown';

export default defineConfig([
  // IIFE bundle for CDN usage
  {
    entry: { 'embrace-web-sdk': 'src/index.ts' },
    format: 'iife',
    target: 'es6',
    outDir: 'dist',
    sourcemap: true,
    platform: 'browser',
    minify: true,
    clean: true,
    inlineOnly: false,
    noExternal: [/.*/],
    outputOptions: {
      banner: '"use strict"; window.EmbraceWebSdk = window.EmbraceWebSdk || ',
      entryFileNames: 'embrace-web-sdk.js',
    },
  },
  // ESM/CJS modules for package consumers
  {
    entry: ['src/**/*.ts', '!src/**/*.test.*'],
    format: ['cjs', 'esm'],
    target: 'es2022',
    dts: true,
    outDir: 'dist',
    sourcemap: true,
    platform: 'browser',
    unbundle: true,
    clean: false,
    publint: true,
    attw: {
      profile: 'esm-only',
    },
  },
]);
