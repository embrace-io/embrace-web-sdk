import commonjsRollup from '@rollup/plugin-commonjs';
import { nodeResolve as nodeResolveRollup } from '@rollup/plugin-node-resolve';
import { esbuildPlugin } from '@web/dev-server-esbuild';
import { fromRollup } from '@web/dev-server-rollup';

const commonjs = fromRollup(commonjsRollup);
const nodeResolve = fromRollup(nodeResolveRollup);

export default {
  nodeResolve: true,
  files: ['src/**/*.test.ts'],
  plugins: [
    esbuildPlugin({ ts: true }),
    nodeResolve({ browser: true, preferBuiltins: false }),
    commonjs()
  ],
  concurrentBrowsers: 3
};
