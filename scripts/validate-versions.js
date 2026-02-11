#!/usr/bin/env node
/**
 * Validates and updates version across package.json, constants, and golden files.
 *
 * Modes:
 *   node scripts/validate-versions.js              # Lint: validate all match SDK version
 *   node scripts/validate-versions.js --fix        # Fix: update all to SDK version
 *   node scripts/validate-versions.js --fix --version 2.8.0  # Fix: update ALL to 2.8.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

// File groups
const packageFiles = {
  sdk: 'packages/web-sdk/package.json',
  cli: 'packages/web-cli/package.json',
};

const constantsFiles = {
  sdk: 'packages/web-sdk/src/resources/constants/index.ts',
  cli: 'packages/web-cli/src/constants.ts',
};

const goldenDir = path.join(rootDir, 'tests/integration/tests/__golden__');
const goldenFiles = fs
  .readdirSync(goldenDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => path.join(goldenDir, f));

// Regex patterns
const constantsPattern = /(SDK_VERSION|CLI_VERSION) = '([^']+)'/;
const goldenPattern =
  /"key":\s*"(?:sdk_version|telemetry\.sdk\.version)"[^}]*"stringValue":\s*"([^"]+)"/g;

// Parse CLI args
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const versionIdx = args.indexOf('--version');
const versionFromCli = versionIdx >= 0 ? args[versionIdx + 1] : null;

// Validate args
if (versionIdx >= 0 && !versionFromCli) {
  console.error('❌ --version requires a version argument');
  console.error(
    '   Example: node scripts/validate-versions.js --fix --version 2.8.0',
  );
  process.exit(1);
}

if (versionFromCli && !shouldFix) {
  console.error('❌ --version requires --fix');
  console.error(
    '   Use: node scripts/validate-versions.js --fix --version 2.8.0',
  );
  process.exit(1);
}

// Determine target version based on mode
const sdkPackage = JSON.parse(
  fs.readFileSync(path.join(rootDir, packageFiles.sdk), 'utf-8'),
);
const targetVersion = versionFromCli || sdkPackage.version;

console.log(`Target version: ${targetVersion}`);
console.log(`Mode: ${shouldFix ? 'FIX' : 'LINT'}\n`);

// Helper: Read and parse package.json
function getPackageVersion(file) {
  const filePath = path.join(rootDir, file);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return { filePath, version: json.version, json };
}

// Helper: Read and extract constant version
function getConstantVersion(file) {
  const filePath = path.join(rootDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(constantsPattern);
  return {
    filePath,
    version: match ? match[2] : null,
    content,
  };
}

// Helper: Extract all versions from golden file
function getGoldenVersions(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const versions = new Set();
  const matches = content.matchAll(goldenPattern);
  for (const match of matches) {
    versions.add(match[1]);
  }
  return { filePath, versions: Array.from(versions), content };
}

// Collect current state
const packageVersions = {
  sdk: getPackageVersion(packageFiles.sdk),
  cli: getPackageVersion(packageFiles.cli),
};

const constantVersions = {
  sdk: getConstantVersion(constantsFiles.sdk),
  cli: getConstantVersion(constantsFiles.cli),
};

const goldenData = goldenFiles.map(getGoldenVersions);

// LINT MODE: Check all files match target
if (!shouldFix) {
  let hasErrors = false;

  // Check CLI package.json
  if (packageVersions.cli.version !== targetVersion) {
    console.error(
      `❌ ${packageFiles.cli} version is ${packageVersions.cli.version}, expected ${targetVersion}`,
    );
    hasErrors = true;
  }

  // Check constants
  for (const [name, data] of Object.entries(constantVersions)) {
    if (!data.version) {
      console.error(
        `❌ ${name === 'sdk' ? constantsFiles.sdk : constantsFiles.cli}: VERSION pattern not found`,
      );
      hasErrors = true;
    } else if (data.version !== targetVersion) {
      console.error(
        `❌ ${name === 'sdk' ? constantsFiles.sdk : constantsFiles.cli}: version is ${data.version}, expected ${targetVersion}`,
      );
      hasErrors = true;
    }
  }

  // Check golden files
  for (const golden of goldenData) {
    const wrongVersions = golden.versions.filter((v) => v !== targetVersion);
    if (wrongVersions.length > 0) {
      console.error(
        `❌ ${path.basename(golden.filePath)}: contains versions [${wrongVersions.join(', ')}], expected ${targetVersion}`,
      );
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('\n❌ Version mismatches found');
    console.error('   Run with --fix to update all files to SDK version');
    console.error('   Run with --fix --version X.Y.Z to set a new version');
    process.exit(1);
  }

  console.log('✅ All versions match');
  process.exit(0);
}

// FIX MODE: Update all files to target version
console.log('Updating files...\n');

// Update SDK package.json if setting new version
if (versionFromCli) {
  const pkg = packageVersions.sdk;
  pkg.json.version = targetVersion;
  fs.writeFileSync(pkg.filePath, `${JSON.stringify(pkg.json, null, 2)}\n`);
  console.log(`✅ Updated ${packageFiles.sdk} to ${targetVersion}`);
}

// Update CLI package.json
if (packageVersions.cli.version !== targetVersion) {
  const pkg = packageVersions.cli;
  pkg.json.version = targetVersion;
  fs.writeFileSync(pkg.filePath, `${JSON.stringify(pkg.json, null, 2)}\n`);
  console.log(`✅ Updated ${packageFiles.cli} to ${targetVersion}`);
}

// Update constants files
for (const [name, data] of Object.entries(constantVersions)) {
  const fileName = name === 'sdk' ? constantsFiles.sdk : constantsFiles.cli;
  if (data.version !== targetVersion) {
    const updated = data.content.replace(
      constantsPattern,
      `$1 = '${targetVersion}'`,
    );
    fs.writeFileSync(data.filePath, updated);
    console.log(`✅ Updated ${fileName} to ${targetVersion}`);
  }
}

// Update golden files
for (const golden of goldenData) {
  const wrongVersions = golden.versions.filter((v) => v !== targetVersion);
  if (wrongVersions.length > 0) {
    let updated = golden.content;
    for (const oldVersion of wrongVersions) {
      updated = updated.replaceAll(oldVersion, targetVersion);
    }
    fs.writeFileSync(golden.filePath, updated);
    console.log(
      `✅ Updated ${path.basename(golden.filePath)} (${wrongVersions.join(', ')} → ${targetVersion})`,
    );
  }
}

console.log(`\n✅ All files updated to version ${targetVersion}`);
process.exit(0);
