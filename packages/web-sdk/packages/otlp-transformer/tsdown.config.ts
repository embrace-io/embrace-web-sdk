import type { TsdownPlugin } from 'tsdown';
import { defineConfig } from 'tsdown';

const failOnWarnPlugin: TsdownPlugin = {
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
  outDir: 'dist',
  sourcemap: true,
  platform: 'browser',
  clean: true,
  publint: true,
  plugins: [
    failOnWarnPlugin, // used in place of failOnWarn: true
  ],
  deps: {
    alwaysBundle: () => true,
  },
  inputOptions: {
    checks: {
      pluginTimings: false, // CI environments vary in speed
    },
  },
  attw: {
    profile: 'esm-only',
  },
});
