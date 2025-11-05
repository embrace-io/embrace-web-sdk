#!/usr/bin/env node
/**
 * Comprehensive SDK validation
 *
 * Validates:
 * 1. Syntax compliance (es-check)
 * 2. Web API baseline compatibility
 * 3. Package exports & integrity (artifacts, sourcemaps, imports)
 * 4. Bundle size
 * 5. Module integrity (ESM/CJS separation)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import bcd from '@mdn/browser-compat-data' with { type: 'json' };
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import {
  BROWSERSLIST_QUERY,
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

const ACORN_PARSE_OPTIONS = {
  ecmaVersion: 'latest',
  sourceType: 'script',
};

// returns a comma-separated string of baseline targets
function getBaselineTargets() {
  try {
    const output = execSync(
      `npx browserslist-to-esbuild "${BROWSERSLIST_QUERY}"`,
      {
        encoding: 'utf-8',
      },
    );
    return output.trim().replace(/\s+/g, ',');
  } catch (error) {
    throw new Error(
      `Failed to fetch baseline targets: ${error.message}\nQuery: ${BROWSERSLIST_QUERY}`,
    );
  }
}

// returns an object of baseline targets
function getBaselineTargetsObject() {
  const targetString = getBaselineTargets();
  const targets = {};

  for (const target of targetString.split(',')) {
    const match = target.match(/^(\D+)([\d.]+)$/);
    if (match) {
      const [, browser, version] = match;
      targets[browser] = version;
    }
  }

  return targets;
}

export { getBaselineTargets, getBaselineTargetsObject };

function checkSyntaxCompliance() {
  logSection('1. Syntax Compliance (es-check)');

  const bundleFile = path.join(DIST_DIR, BUNDLE_FILE);

  const checks = [
    {
      name: 'IIFE bundle',
      modules: false,
      pattern: `"${bundleFile}"`,
      esVersion: 'es6',
    },
    {
      name: 'ESM modules',
      modules: true,
      pattern: `"${DIST_DIR}/**/*.js"`,
      exclude: `${bundleFile}*`,
      esVersion: 'es2022',
    },
    {
      name: 'CJS modules',
      modules: true,
      pattern: `"${DIST_DIR}/**/*.cjs"`,
      esVersion: 'es2022',
    },
  ];

  const failures = checks.filter((check) => {
    try {
      const excludeFlag = check.exclude ? `--not ${check.exclude}` : '';
      const moduleFlag = check.modules ? '--module' : '';
      execSync(
        `npx es-check ${check.esVersion} ${check.pattern} ${excludeFlag} ${moduleFlag}`,
        { stdio: 'pipe', encoding: 'utf-8' },
      );
      log(`  ✓ ${check.name}`, COLORS.green);
      return false;
    } catch (error) {
      log(`  ✗ ${check.name} failed`, COLORS.red);
      log(`    ${error.message}`, COLORS.dim);
      return true;
    }
  });

  if (failures.length > 0) {
    log('\nSyntax compliance failures:', COLORS.red + COLORS.bold);
    failures.forEach((f) => {
      log(`  ${f.name}`, COLORS.red);
    });
    return false;
  }

  log('\n✓ All syntax checks passed', COLORS.green);
  return true;
}

// Extracts Web API usage via AST to detect actual API calls, filters to BCD APIs only, tracks feature checks
function extractWebAPIs(code) {
  const results = {
    constructors: new Set(),
    staticMethods: new Map(),
    globalFunctions: new Set(),
    featureChecks: [],
  };

  let ast;
  try {
    ast = acorn.parse(code, ACORN_PARSE_OPTIONS);
  } catch (error) {
    log(
      `  ⚠ Failed to parse code for Web API extraction: ${error.message}`,
      COLORS.yellow,
    );
    return results;
  }

  walk.simple(ast, {
    NewExpression(node) {
      if (node.callee.type === 'Identifier') {
        const name = node.callee.name;
        // Filter to BCD APIs only - avoids false positives from user constructors
        if (bcd.api[name]) {
          results.constructors.add(name);
        }
      }
    },

    CallExpression(node) {
      // Pattern: Object.method() - e.g., Object.entries(), Array.from()
      if (
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.object.type === 'Identifier' &&
        node.callee.property.type === 'Identifier'
      ) {
        const object = node.callee.object.name;
        const method = node.callee.property.name;

        if (!bcd.api[object]) return;

        // BCD stores static methods with _static suffix
        const methodEntry =
          bcd.api[object][`${method}_static`] || bcd.api[object][method];
        if (!methodEntry) return;

        if (!results.staticMethods.has(object)) {
          results.staticMethods.set(object, new Set());
        }
        results.staticMethods.get(object).add(method);
        return;
      }

      // Pattern: globalFunction() - e.g., fetch(), queueMicrotask()
      if (node.callee.type === 'Identifier') {
        const name = node.callee.name;
        if (bcd.api[name] || bcd.api.Window?.[name]) {
          results.globalFunctions.add(name);
        }
      }
    },

    BinaryExpression(node) {
      // Pattern: 'property' in Object or property in Object
      // This detects feature detection - crucial for determining safety
      if (node.operator === 'in' && node.right.type === 'Identifier') {
        const object = node.right.name;
        let property;

        if (node.left.type === 'Literal') {
          property = node.left.value;
        } else if (node.left.type === 'Identifier') {
          property = node.left.name;
        }

        if (property && typeof property === 'string' && bcd.api[object]) {
          results.featureChecks.push({ property, object });
        }
      }
    },
  });

  return results;
}

// Checks if API is supported across baseline browsers using version_added (parseFloat for decimal comparison)
function checkAPISupport(apiPath, bcdData, targets) {
  if (!bcdData?.__compat?.support) return null;

  const issues = [];

  for (const [browser, targetVersion] of Object.entries(targets)) {
    const browserSupport = bcdData.__compat.support[browser];
    if (!browserSupport) continue;

    // Handle both single objects and arrays of support statements
    const statement = Array.isArray(browserSupport)
      ? browserSupport[0]
      : browserSupport;
    const versionAdded = statement?.version_added;

    if (versionAdded === false) {
      issues.push({ browser, issue: 'not supported' });
    } else if (
      typeof versionAdded === 'string' &&
      parseFloat(versionAdded) > parseFloat(targetVersion)
    ) {
      issues.push({
        browser,
        issue: `requires ${versionAdded}, baseline is ${targetVersion}`,
      });
    }
  }

  return {
    path: apiPath,
    supported: issues.length === 0,
    issues,
    mdn: bcdData.__compat.mdn_url,
  };
}

// Determines if feature check covers API usage (distinguishes safe progressive enhancement from breaking changes)
function matchesFeatureCheck(check, type, name) {
  if (type === 'constructor') {
    return check.object === name;
  }

  if (type === 'method') {
    const [obj, method] = name.split('.');
    return check.object === obj && check.property === method;
  }

  return false;
}

// Categorizes: compatible (works everywhere), withFeatureDetection (safe), incompatible (blocking)
function categorizeAPIResult(name, type, result, featureChecks) {
  if (!result) return null;

  const item = { type, name, ...result };

  if (result.supported) {
    return { category: 'compatible', item };
  }

  const hasFeatureCheck = featureChecks.some((check) =>
    matchesFeatureCheck(check, type, name),
  );

  return {
    category: hasFeatureCheck ? 'withFeatureDetection' : 'incompatible',
    item,
  };
}

// Analyzes bundle and extracts Web API usage patterns (returns null if bundle doesn't exist)
function analyzeBundle() {
  const bundlePath = path.join(DIST_DIR, BUNDLE_FILE);

  if (!fs.existsSync(bundlePath)) {
    log('⚠ Bundle not found, skipping Web API check', COLORS.yellow);
    return null;
  }

  log('Analyzing bundle...', COLORS.blue);
  const code = fs.readFileSync(bundlePath, 'utf-8');
  const patterns = extractWebAPIs(code);

  log(
    `  Found ${patterns.constructors.size} constructors, ${patterns.staticMethods.size} objects, ${patterns.globalFunctions.size} global functions`,
    COLORS.dim,
  );

  return patterns;
}

/**
 * Validates all extracted Web APIs against browser compatibility data.
 *
 * Categorizes APIs into three groups based on baseline compatibility:
 * - compatible: Work across all baseline browsers
 * - incompatible: Don't meet baseline requirements and lack feature detection
 * - withFeatureDetection: Don't meet baseline but have feature detection
 */
function validateAPICompatibility(patterns, targets) {
  const results = {
    compatible: [],
    incompatible: [],
    withFeatureDetection: [],
  };

  // Check constructors (already filtered by BCD in extractWebAPIs)
  for (const name of patterns.constructors) {
    const result = checkAPISupport(`api.${name}`, bcd.api[name], targets);
    const categorized = categorizeAPIResult(
      name,
      'constructor',
      result,
      patterns.featureChecks,
    );
    if (categorized) results[categorized.category].push(categorized.item);
  }

  // Check static methods (already filtered by BCD in extractWebAPIs)
  for (const [objectName, methods] of patterns.staticMethods) {
    for (const methodName of methods) {
      const bcdEntry =
        bcd.api[objectName][`${methodName}_static`] ||
        bcd.api[objectName][methodName];
      const result = checkAPISupport(
        `api.${objectName}.${methodName}`,
        bcdEntry,
        targets,
      );
      const categorized = categorizeAPIResult(
        `${objectName}.${methodName}`,
        'method',
        result,
        patterns.featureChecks,
      );
      if (categorized) results[categorized.category].push(categorized.item);
    }
  }

  // Check global functions (already filtered by BCD in extractWebAPIs)
  for (const name of patterns.globalFunctions) {
    const bcdEntry = bcd.api[name] || bcd.api.Window?.[name];
    const result = checkAPISupport(`api.${name}`, bcdEntry, targets);
    const categorized = categorizeAPIResult(
      name,
      'function',
      result,
      patterns.featureChecks,
    );
    if (categorized) results[categorized.category].push(categorized.item);
  }

  return results;
}

// Reports API results (returns false if incompatible APIs exist)
function reportAPIResults(results) {
  if (results.compatible.length > 0) {
    log(
      `  ✓ ${results.compatible.length} APIs are baseline compatible`,
      COLORS.green,
    );
  }

  if (results.withFeatureDetection.length > 0) {
    log(
      `  ⚠ ${results.withFeatureDetection.length} APIs with feature detection`,
      COLORS.yellow,
    );
    for (const item of results.withFeatureDetection) {
      log(`    ${item.name}`, COLORS.dim);
    }
  }

  if (results.incompatible.length > 0) {
    log(
      `\n  ✗ ${results.incompatible.length} incompatible APIs:`,
      COLORS.red + COLORS.bold,
    );
    for (const item of results.incompatible) {
      log(`    ${item.name}`, COLORS.red);
      for (const issue of item.issues) {
        log(`      ${issue.browser}: ${issue.issue}`, COLORS.dim);
      }
    }
    return false;
  }

  log('\n✓ All Web APIs are baseline compatible', COLORS.green);
  return true;
}

function checkWebAPICompliance(targets) {
  logSection('2. Web API Baseline Compliance');

  const patterns = analyzeBundle();
  if (!patterns) {
    return true; // Bundle not found, skip check
  }

  const results = validateAPICompatibility(patterns, targets);
  return reportAPIResults(results);
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
  logSection('3. Package Exports & Integrity');

  if (!checkBuildArtifactsExist()) return false;
  if (!validateSourcemapIntegrity()) return false;
  if (!validateSourcemapReference()) return false;
  if (!testPackageInstallAndImports()) return false;
  validateWithPublint();

  log('\n✓ Package exports valid', COLORS.green);
  return true;
}

function checkBundleSize() {
  logSection('4. Bundle Size');

  const bundleFile = path.join(DIST_DIR, BUNDLE_FILE);

  if (!fs.existsSync(bundleFile)) {
    log('✗ Bundle not found', COLORS.red);
    return false;
  }

  const rawSize = fs.statSync(bundleFile).size;
  const gzipSize = zlib.gzipSync(fs.readFileSync(bundleFile)).length;

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
}

// Validates ESM/CJS don't mix syntax (require() in .js or import in .cjs causes runtime errors)
function validateModuleSystemSeparation() {
  logSection('5. Module Integrity');

  const checks = [
    {
      name: 'require() in ESM files',
      cmd: `grep -r "require(" ${DIST_DIR} --include="*.js" --exclude="*.cjs"`,
      expectFail: true,
    },
    {
      name: 'import in CJS files',
      cmd: `grep -r "import" ${DIST_DIR} --include="*.cjs"`,
      expectFail: true,
    },
  ];

  for (const check of checks) {
    try {
      const output = execSync(check.cmd, { stdio: 'pipe', encoding: 'utf-8' });
      // Command succeeded - found matches
      log(`  ✗ Found ${check.name}`, COLORS.red);
      if (output) {
        log(`    ${output.trim().slice(0, 200)}`, COLORS.dim);
      }
      return false;
    } catch {
      // Command failed - no matches found (expected for expectFail checks)
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

  const targets = getBaselineTargetsObject();
  log(`Query: ${BROWSERSLIST_QUERY}`, COLORS.dim);
  log(
    `Targets: ${Object.entries(targets)
      .map(([b, v]) => `${b}${v}`)
      .join(', ')}`,
    COLORS.cyan,
  );

  const results = [
    { name: 'Syntax compliance', passed: checkSyntaxCompliance() },
    { name: 'Web API compatibility', passed: checkWebAPICompliance(targets) },
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

// Only run main if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
