import { runBundlerBuildSmokeTest } from '../utils/index.js';

await runBundlerBuildSmokeTest('../vite-7', {
  targets: ['esnext', 'es2015'],
  bundlerName: 'Vite 7',
});
