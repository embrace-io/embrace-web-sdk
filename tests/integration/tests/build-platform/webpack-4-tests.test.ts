import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlatformBuildSmokeTest } from '../../utils/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformDir = resolve(__dirname, '../../platforms/webpack-4');

await runPlatformBuildSmokeTest(platformDir, {
  targets: ['es2015'],
  platformName: 'webpack-4',
  // webpack 4 does not support sonda
  includePlatformSizeTest: false,
});
