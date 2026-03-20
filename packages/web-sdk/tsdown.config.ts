import process from 'node:process';
import Sonda from 'sonda/rolldown';
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
    clean: false,
    failOnWarn: true,
    plugins: [
      Sonda({
        enabled: true,
        format: process.env.SONDA ? ['html', 'json'] : ['json'],
        open: process.env.SONDA ? 'html' : false,
        gzip: true,
        deep: true,
      }),
    ],
    deps: {
      alwaysBundle: () => true,
    },
    inputOptions: {
      checks: {
        missingNameOptionForIifeExport: false, // We use banner to assign global
        pluginTimings: false, // CI environments vary in speed
      },
    },
    outputOptions: {
      // Assign to global for CDN script tag usage
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
    failOnWarn: true,
    publint: true,
    inputOptions: {
      checks: {
        pluginTimings: false, // CI environments vary in speed
      },
    },
    attw: {
      profile: 'strict',
    },
  },
]);
