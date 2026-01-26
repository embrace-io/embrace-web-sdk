import { resolve } from 'node:path';
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
      resolve: {
        alias: {
          '@opentelemetry/otlp-transformer': resolve(
            import.meta.dirname,
            'packages/otlp-transformer/dist/index.js',
          ),
        },
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
    // Aliased otlp-transformer is intentionally inlined; others are transitive type deps
    inlineOnly: [
      '@opentelemetry/otlp-transformer',
      '@opentelemetry/sdk-metrics', // type-only, transitive from otlp-transformer
      '@opentelemetry/sdk-trace-base', // transitive from sdk-trace-web
    ],
    inputOptions: {
      checks: {
        pluginTimings: false, // CI environments vary in speed
      },
      resolve: {
        alias: {
          '@opentelemetry/otlp-transformer': resolve(
            import.meta.dirname,
            'packages/otlp-transformer/dist/index.js',
          ),
        },
      },
    },
    attw: {
      profile: 'esm-only',
    },
  },
]);
