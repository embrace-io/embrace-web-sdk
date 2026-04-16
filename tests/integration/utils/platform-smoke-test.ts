import assert from 'node:assert';
import fs from 'node:fs';
import { resolve } from 'node:path';
import runPlatformBuildSmokeTest from './run-platform-smoke-test.ts';

const platformDir = process.cwd();
const pkgPath = resolve(platformDir, 'package.json');
assert.ok(
  fs.existsSync(pkgPath),
  `Expected package.json at ${pkgPath}. This script must be run from a platform directory.`,
);

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const platformName: string = pkg.name;
const scripts: Record<string, string> = pkg.scripts ?? {};
const devDeps: Record<string, string> = pkg.devDependencies ?? {};

const targets = Object.keys(scripts)
  .filter((s) => s.startsWith('build:') && s !== 'build:clean')
  .map((s) => s.replace('build:', ''));

assert.ok(
  targets.length > 0,
  `No build targets found in ${platformName}. Expected at least one "build:<target>" script in package.json.`,
);

const hasSonda = 'sonda' in devDeps;

await runPlatformBuildSmokeTest(platformDir, {
  targets,
  platformName,
  includePlatformSizeTest: hasSonda,
});
