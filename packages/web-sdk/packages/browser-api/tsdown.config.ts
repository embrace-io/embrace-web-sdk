import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: false,
  outDir: 'dist',
  sourcemap: true,
  platform: 'browser',
  clean: true,
  failOnWarn: true,
  publint: true,
  inputOptions: {
    checks: {
      pluginTimings: false, // CI environments vary in speed
    },
  },
  attw: {
    profile: 'esm-only',
  },
});
