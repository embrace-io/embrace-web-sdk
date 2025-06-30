import { runBundlerBuildSmokeTest } from '../utils/index.js';

await runBundlerBuildSmokeTest('../webpack-5', {
  targets: ['esnext', 'es2015'],
  bundlerName: 'Webpack 5',
});
