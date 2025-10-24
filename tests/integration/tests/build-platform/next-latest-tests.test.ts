import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlatformBuildSmokeTest } from '../../utils/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformDir = resolve(__dirname, '../../platforms/next-latest');

await runPlatformBuildSmokeTest(platformDir, {
  targets: ['es2020'],
  platformName: 'next-latest',
  // With Next.js, it's hard to say what the platform size will be, since it uses SSR and split the builds into different chunks depending on what it needs.
  includePlatformSizeTest: false,
  // We serve Next JS directly with `next start`
  copyOutputToServer: false,
});
