import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.*', '!src/testUtils/**'],
  format: ['cjs', 'esm'],
  target: 'es2022',
  dts: true,
  outDir: 'dist',
  sourcemap: true,
  platform: 'browser',
  splitting: false,
  unbundle: true,
  clean: false,
  publint: true,
  attw: {
    profile: 'esm-only',
  },
});
