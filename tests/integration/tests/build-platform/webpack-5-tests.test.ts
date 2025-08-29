import { runPlatformBuildSmokeTest } from '../../utils/index.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformDir = resolve(__dirname, '../../platforms/webpack-5');

await runPlatformBuildSmokeTest(platformDir, {
  targets: ['esnext', 'es2015'],
  platformName: 'webpack-5',
});
