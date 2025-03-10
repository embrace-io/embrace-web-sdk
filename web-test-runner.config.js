import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  files: ['src/**/*.test.ts'],
  plugins: [esbuildPlugin({ ts: true })],
};
