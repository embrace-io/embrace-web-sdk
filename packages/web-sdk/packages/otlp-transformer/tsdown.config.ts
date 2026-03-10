import type { Plugin } from 'rolldown';
import { defineConfig } from 'tsdown';

const failOnWarnPlugin: Plugin = {
  name: 'fail-on-warn',
  onLog(level, log) {
    // Suppress eval warning from protobufjs - tree-shaking removes it from output
    if (log.code === 'EVAL' && log.message.includes('@protobufjs/inquire')) {
      return false;
    }
    if (level === 'warn') {
      throw new Error(`Build warning [${log.code}]: ${log.message}`);
    }
  },
};

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: false,
  dts: true,
  outDir: 'dist',
  sourcemap: true,
  minify: {
    // Remove comments but don't mangle
    compress: true,
    mangle: false,
  },
  platform: 'browser',
  clean: true,
  publint: true,
  plugins: [failOnWarnPlugin],
  deps: {
    alwaysBundle: () => true,
  },
  attw: {
    profile: 'esm-only',
  },
});
