#!/usr/bin/env node
/**
 * Validates and updates version across package.json, constants, and golden files.
 *
 * Usage:
 *   node scripts/validate-versions.js              # Lint
 *   node scripts/validate-versions.js --fix        # Fix
 *   node scripts/validate-versions.js --fix --version 2.8.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const versionIdx = args.indexOf('--version');
const newVersion = versionIdx >= 0 ? args[versionIdx + 1] : null;

// Validate --version requires --fix
if (newVersion && !shouldFix) {
  console.error('❌ --version requires --fix flag');
  process.exit(1);
}

// Validate --version has argument
if (versionIdx >= 0 && !newVersion) {
  console.error('❌ --version requires a version argument');
  process.exit(1);
}

// Set version in package.json files
if (newVersion) {
  for (const file of ['package.json', 'cli/package.json']) {
    const pkgPath = path.join(rootDir, file);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const oldVersion = pkg.version;
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`${file}: ${oldVersion} → ${newVersion}`);
  }
}

const sdkVersion = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'),
).version;
const cliVersion = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'cli/package.json'), 'utf-8'),
).version;

let hasErrors = false;

// Check package.json versions match
if (sdkVersion !== cliVersion) {
  console.error(
    `❌ package.json (${sdkVersion}) !== cli/package.json (${cliVersion})`,
  );
  hasErrors = true;
}

// Check/fix constants
const constantFiles = [
  {
    file: 'src/resources/constants/index.ts',
    pattern: /SDK_VERSION = '.*'/,
    replacement: `SDK_VERSION = '${sdkVersion}'`,
  },
  {
    file: 'cli/src/constants.ts',
    pattern: /CLI_VERSION = '.*'/,
    replacement: `CLI_VERSION = '${cliVersion}'`,
  },
];

for (const { file, pattern, replacement } of constantFiles) {
  const filePath = path.join(rootDir, file);

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (_e) {
    console.error(`❌ ${file}: file not found`);
    hasErrors = true;
    continue;
  }

  const match = content.match(pattern);

  if (!match) {
    console.error(`❌ ${file}: pattern not found`);
    hasErrors = true;
    continue;
  }

  if (match[0] !== replacement) {
    console.error(`❌ ${file}: ${match[0]} !== ${replacement}`);
    hasErrors = true;
    if (shouldFix)
      fs.writeFileSync(filePath, content.replaceAll(match[0], replacement));
  }
}

// Check/fix golden files
const goldenDir = path.join(rootDir, 'tests/integration/tests/__golden__');
if (fs.existsSync(goldenDir)) {
  const goldenPattern =
    /("key":\s*"(?:sdk_version|telemetry\.sdk\.version|sdk_simple_version)"[\s\S]*?"stringValue":\s*")(\d+\.\d+\.\d+)(")/g;

  for (const file of fs
    .readdirSync(goldenDir)
    .filter((f) => f.endsWith('.json'))) {
    const filePath = path.join(goldenDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse JSON to validate it
    try {
      JSON.parse(content);
    } catch (_e) {
      console.error(`❌ ${file}: invalid JSON`);
      hasErrors = true;
      continue;
    }

    const wrongVersions = new Set(
      Array.from(content.matchAll(goldenPattern), (m) => m[2]).filter(
        (v) => v !== sdkVersion,
      ),
    );

    if (wrongVersions.size > 0) {
      console.error(
        `❌ ${file}: found ${Array.from(wrongVersions).join(', ')}`,
      );
      hasErrors = true;
      if (shouldFix) {
        let updated = content;
        for (const oldVersion of wrongVersions) {
          updated = updated.replaceAll(oldVersion, sdkVersion);
        }
        fs.writeFileSync(filePath, updated);
      }
    }
  }
}

if (!hasErrors) {
  console.log('✅ All versions match');
  process.exit(0);
}

if (shouldFix) {
  console.log('✅ Fixed all mismatches');
  process.exit(0);
}

console.log('\nRun with --fix to update');
process.exit(1);
