#!/usr/bin/env node
/**
 * Build script for Embrace Web SDK
 *
 * Steps:
 * 1. Clean dist/
 * 2. Determine baseline targets from browserslist
 * 3. Build IIFE bundle (esbuild)
 * 4. Build SDK modules (tsdown)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSERSLIST_QUERY,
  BUNDLE_FILE,
  COLORS,
  log,
  logSection,
} from './build-config.js';
import { getBaselineTargets } from './validate-sdk.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');

function run(command, description) {
  log(`\n${description}...`, COLORS.blue);
  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: ROOT,
    });
    log(`✓ ${description} complete`, COLORS.green);
  } catch {
    log(`✗ ${description} failed`, COLORS.red);
    process.exit(1);
  }
}

function buildIIFE(targets) {
  logSection('Building IIFE bundle');

  // Build and minify IIFE bundle with baseline browser targets
  run(
    `npx esbuild src/index.ts --bundle --format=iife --global-name=EmbraceWebSdk --target=${targets} --sourcemap --legal-comments=none --outfile=dist/${BUNDLE_FILE}`,
    `Building IIFE with esbuild (${targets})`,
  );
}

function buildSDK(targets) {
  logSection('Building SDK modules');

  // Compile with tsdown using baseline targets
  run(
    `npx tsdown 'src/**/*.ts' '!src/**/*.test.*' '!src/testUtils/**' --format cjs,esm --target=${targets} --dts --outDir dist --sourcemap --platform browser --no-splitting --unbundle --no-clean`,
    `Compiling TypeScript with tsdown (${targets})`,
  );
}

function main() {
  logSection('Embrace Web SDK Build');

  // Step 1: Determine baseline targets
  logSection('Determining Baseline Targets');
  const targets = getBaselineTargets();
  log(`Query: ${BROWSERSLIST_QUERY}`, COLORS.dim);
  log(`Baseline targets: ${targets}`, COLORS.green);

  // Step 2: Clean dist/
  logSection('Cleaning dist/');
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
    log('✓ dist/ removed', COLORS.green);
  } else {
    log('✓ dist/ already clean', COLORS.dim);
  }

  // Step 3: Build IIFE
  // TBD: should we use baseline as targets?
  // buildIIFE(targets);
  buildIIFE('es6');

  // Step 4: Build SDK
  buildSDK(targets);

  // Done
  logSection('Build Complete');
  log('✓ All builds successful!', COLORS.green + COLORS.bold);
  log('\nNext steps:', COLORS.dim);
  log(
    '  npm run sdk:validate:baseline  # Check baseline compliance',
    COLORS.dim,
  );
  log('  npm run sdk:test               # Run tests', COLORS.dim);
}

main();
