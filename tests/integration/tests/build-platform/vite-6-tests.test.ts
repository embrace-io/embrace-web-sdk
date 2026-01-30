import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlatformBuildSmokeTest } from '../../utils/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformDir = resolve(__dirname, '../../platforms/vite-6');

await runPlatformBuildSmokeTest(platformDir, {
  targets: ['es2015'],
  platformName: 'vite-6',
});
