import type { Plugin } from 'rolldown';
import { defineConfig } from 'tsdown';

// Treat warnings as errors; use checks config to disable known harmless warnings
const failOnWarnPlugin: Plugin = {
  name: 'fail-on-warn',
  onLog(level, log) {
    if (level === 'warn') {
      throw new Error(`Build warning [${log.code}]: ${log.message}`);
    }
  },
};

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
    plugins: [failOnWarnPlugin],
    inlineOnly: false, // IIFE bundles all deps intentionally
    noExternal: [/.*/],
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
    publint: true,
    plugins: [failOnWarnPlugin],
    inlineOnly: ['@embrace-io/otlp-transformer'],
    inputOptions: {
      checks: {
        pluginTimings: false, // CI environments vary in speed
      },
    },
    attw: {
      profile: 'esm-only',
    },
  },
]);
