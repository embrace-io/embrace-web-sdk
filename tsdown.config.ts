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
          // Stub inquire to avoid "Critical dependency" warning from protobufjs require()
          '@protobufjs/inquire': resolve(
            import.meta.dirname,
            'src/_internal/inquire-stub.cts',
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
    entry: ['src/**/*.{ts,cts}', '!src/**/*.test.*', '!src/_internal'],
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
    // Bundle otlp-transformer so inquire stub alias applies to its protobufjs dep
    noExternal: ['@opentelemetry/otlp-transformer'],
    // Allowlist prevents unintentional bundling; build fails if unlisted dep is bundled
    inlineOnly: [
      '@opentelemetry/otlp-transformer',
      '@opentelemetry/sdk-metrics',
      '@opentelemetry/sdk-trace-base',
      '@protobufjs/aspromise',
      '@protobufjs/base64',
      '@protobufjs/eventemitter',
      '@protobufjs/float',
      '@protobufjs/pool',
      '@protobufjs/utf8',
      'protobufjs',
    ],
    inputOptions: {
      checks: {
        pluginTimings: false, // CI environments vary in speed
      },
      resolve: {
        alias: {
          // Stub inquire to avoid "Critical dependency" warning from protobufjs require()
          '@protobufjs/inquire': resolve(
            import.meta.dirname,
            'src/_internal/inquire-stub.cts',
          ),
        },
      },
    },
    attw: {
      profile: 'esm-only',
    },
  },
]);
