#!/usr/bin/env node
/**
 * SDK build validation
 *
 * Validates:
 * 1. Syntax compliance (es-check on compiled output)
 * 2. Package exports & integrity (artifacts, sourcemaps, imports)
 * 3. Bundle size
 * 4. Module integrity (ESM/CJS separation)
 *
 * Note: Web API baseline compliance is checked by eslint-plugin-baseline-js
 * during linting (npm run sdk:check:eslint)
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import {
  BUNDLE_FILE,
  BUNDLE_MAP_FILE,
  COLORS,
  EXPECTED_FILES,
  log,
  logSection,
  MAX_BUNDLE_SIZE_KB,
} from './build-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');

// Verifies compiled bundles parse as expected ES version
function checkSyntaxCompliance() {
  logSection('1. Syntax Compliance (es-check)');

  const bundleFile = path.join(DIST_DIR, BUNDLE_FILE);

  const checks = [
    { name: 'IIFE bundle (ES6)', file: bundleFile, esVersion: 'es6' },
    {
      name: 'ESM modules (ES2022)',
      pattern: `${DIST_DIR}/**/*.js`,
      exclude: `${bundleFile}*`,
      esVersion: 'es2022',
      modules: true,
    },
    {
      name: 'CJS modules (ES2022)',
      pattern: `${DIST_DIR}/**/*.cjs`,
      esVersion: 'es2022',
      modules: true,
    },
  ];

  const failures = [];

  for (const check of checks) {
    const args = ['es-check', check.esVersion, check.file || check.pattern];
    if (check.exclude) args.push('--not', check.exclude);
    if (check.modules) args.push('--module');

    const result = spawnSync('npx', args, { encoding: 'utf-8', stdio: 'pipe' });

    if (result.status !== 0) {
      log(`  ✗ ${check.name}`, COLORS.red);
      failures.push(check.name);
    } else {
      log(`  ✓ ${check.name}`, COLORS.green);
    }
  }

  if (failures.length > 0) {
    return false;
  }

  log('\n✓ All syntax checks passed', COLORS.green);
  return true;
}

// Packs SDK and runs test callback in temp environment with installed tarball
function withPackedSDK(options, testCallback) {
  const tempDir = fs.mkdtempSync(path.join(ROOT, '.tmp'));

  try {
    // Pack the SDK
    execSync('npm pack --quiet', { cwd: ROOT, stdio: 'pipe' });
    const tarball = fs
      .readdirSync(ROOT)
      .find((f) => f.startsWith('embrace-io-web-sdk-') && f.endsWith('.tgz'));

    if (!tarball) {
      throw new Error('Failed to create npm package tarball');
    }

    // Move tarball to temp directory
    fs.renameSync(path.join(ROOT, tarball), path.join(tempDir, 'package.tgz'));

    // Create package.json
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(options.packageJson),
    );

    // Install the packed SDK
    execSync('npm install ./package.tgz', { cwd: tempDir, stdio: 'pipe' });

    // Run the test callback
    return testCallback(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function checkBuildArtifactsExist() {
  const missing = EXPECTED_FILES.filter((file) => !fs.existsSync(file));

  if (missing.length > 0) {
    log('✗ Missing files:', COLORS.red);
    for (const file of missing) {
      log(`  ${file}`, COLORS.red);
    }
    return false;
  }

  log('  ✓ All expected files present', COLORS.green);
  return true;
}

function validateSourcemapIntegrity() {
  try {
    const mapPath = path.join(DIST_DIR, BUNDLE_MAP_FILE);
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
    if (!map.sources?.length) {
      log('  ✗ Sourcemap has no sources', COLORS.red);
      return false;
    }
    log(`  ✓ Sourcemap valid (${map.sources.length} sources)`, COLORS.green);
    return true;
  } catch (error) {
    log(`  ✗ Invalid sourcemap: ${error.message}`, COLORS.red);
    log(`    File: ${BUNDLE_MAP_FILE}`, COLORS.dim);
    return false;
  }
}

function validateSourcemapReference() {
  const bundleFile = path.join(DIST_DIR, BUNDLE_FILE);
  const content = fs.readFileSync(bundleFile, 'utf-8');
  const lines = content.split('\n');
  const lastLine = lines[lines.length - 1] || lines[lines.length - 2];

  if (!lastLine.includes('sourceMappingURL=')) {
    log('  ✗ Missing sourcemap reference in bundle', COLORS.red);
    return false;
  }

  log('  ✓ Sourcemap reference present', COLORS.green);
  return true;
}

function testPackageInstallAndImports() {
  log('  Testing imports...', COLORS.blue);

  try {
    return withPackedSDK({ packageJson: { type: 'module' } }, (tempDir) => {
      // Test ESM import
      try {
        execSync(
          `node --input-type=module -e "import { initSDK } from '@embrace-io/web-sdk'; if (!initSDK) process.exit(1);"`,
          { cwd: tempDir, stdio: 'pipe' },
        );
        log('  ✓ ESM imports work', COLORS.green);
      } catch (error) {
        throw new Error(`ESM import failed: ${error.message}`);
      }

      // Test CommonJS require
      try {
        execSync(
          `node -e "const sdk = require('@embrace-io/web-sdk'); if (!sdk.initSDK) process.exit(1);"`,
          { cwd: tempDir, stdio: 'pipe' },
        );
        log('  ✓ CommonJS require works', COLORS.green);
      } catch (error) {
        throw new Error(`CommonJS require failed: ${error.message}`);
      }

      return true;
    });
  } catch (error) {
    log(`  ✗ Import test failed: ${error.message}`, COLORS.red);
    if (error.stderr) {
      log(`    ${error.stderr.toString()}`, COLORS.dim);
    }
    return false;
  }
}

function validateWithPublint() {
  try {
    execSync('npx publint', { cwd: ROOT, stdio: 'pipe' });
    log('  ✓ publint passed', COLORS.green);
  } catch (error) {
    log('  ⚠ publint warnings (non-fatal)', COLORS.yellow);
    if (error.stdout) {
      log(`    ${error.stdout.toString().trim()}`, COLORS.dim);
    }
  }
  return true;
}

function checkPackageExports() {
  logSection('2. Package Exports & Integrity');

  if (!checkBuildArtifactsExist()) return false;
  if (!validateSourcemapIntegrity()) return false;
  if (!validateSourcemapReference()) return false;
  if (!testPackageInstallAndImports()) return false;
  validateWithPublint();

  log('\n✓ Package exports valid', COLORS.green);
  return true;
}

function checkBundleSize() {
  logSection('3. Bundle Size');

  const bundleFile = path.join(DIST_DIR, BUNDLE_FILE);

  try {
    // Read file once for both size calculations
    const content = fs.readFileSync(bundleFile);
    const rawSize = content.length;
    const gzipSize = zlib.gzipSync(content).length;

    const gzipSizeKB = gzipSize / 1024;

    log(`  Raw size: ${(rawSize / 1024).toFixed(2)} KB`, COLORS.dim);
    log(`  Gzipped: ${gzipSizeKB.toFixed(2)} KB`, COLORS.green);

    if (gzipSizeKB > MAX_BUNDLE_SIZE_KB) {
      log(
        `  ⚠ Bundle is large (${gzipSizeKB.toFixed(2)} KB gzipped)`,
        COLORS.yellow + COLORS.bold,
      );
    }

    return true;
  } catch (error) {
    log(`✗ Bundle not found or unreadable: ${error.message}`, COLORS.red);
    return false;
  }
}

// Validates ESM/CJS don't mix syntax (require() in .js or import in .cjs causes runtime errors)
function validateModuleSystemSeparation() {
  logSection('4. Module Integrity');

  const checks = [
    {
      name: 'require() in ESM files',
      pattern: 'require(',
      include: '*.js',
      exclude: '*.cjs',
    },
    {
      name: 'import in CJS files',
      pattern: 'import',
      include: '*.cjs',
    },
  ];

  for (const check of checks) {
    try {
      // Build args array to avoid shell injection
      const args = [
        '-r',
        check.pattern,
        DIST_DIR,
        `--include=${check.include}`,
      ];
      if (check.exclude) {
        args.push(`--exclude=${check.exclude}`);
      }

      const result = spawnSync('grep', args, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      if (result.status === 0) {
        // Command succeeded - found matches
        log(`  ✗ Found ${check.name}`, COLORS.red);
        if (result.stdout) {
          log(`    ${result.stdout.trim().slice(0, 200)}`, COLORS.dim);
        }
        return false;
      }
      // Command failed - no matches found (expected)
      log(`  ✓ No ${check.name}`, COLORS.green);
    } catch {
      // Command failed - no matches found (expected)
      log(`  ✓ No ${check.name}`, COLORS.green);
    }
  }

  log('\n✓ Module integrity validated', COLORS.green);
  return true;
}

function main() {
  logSection('Embrace Web SDK Validation');

  if (!fs.existsSync(DIST_DIR)) {
    log('✗ dist/ not found. Run npm run compile first.', COLORS.red);
    process.exit(1);
  }

  const results = [
    { name: 'Syntax compliance', passed: checkSyntaxCompliance() },
    { name: 'Package exports', passed: checkPackageExports() },
    { name: 'Bundle size', passed: checkBundleSize() },
    { name: 'Module integrity', passed: validateModuleSystemSeparation() },
  ];

  logSection('Validation Summary');

  results.forEach(({ name, passed }) => {
    log(`  ${passed ? '✓' : '✗'} ${name}`, passed ? COLORS.green : COLORS.red);
  });

  const allPassed = results.every((r) => r.passed);

  log(
    allPassed ? '\n✓ All validations passed!' : '\n✗ Some validations failed',
    allPassed ? COLORS.green + COLORS.bold : COLORS.red + COLORS.bold,
  );

  process.exit(allPassed ? 0 : 1);
}

main();
