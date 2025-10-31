// Shared build configuration for Embrace Web SDK

// Browserslist query targeting baseline-compatible browsers
export const BROWSERSLIST_QUERY = 'baseline widely available with downstream';

// Maximum bundle size (gzipped) to ensure fast load times
export const MAX_BUNDLE_SIZE_KB = 100;

export const BUNDLE_FILE = 'embrace-web-sdk.js';
export const BUNDLE_MAP_FILE = 'embrace-web-sdk.js.map';

// Files that must exist after build
export const EXPECTED_FILES = [
  'dist/embrace-web-sdk.js',
  'dist/embrace-web-sdk.js.map',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/index.cjs',
  'dist/index.d.cts',
];

// ANSI color codes for terminal output
export const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

export function log(message, color = '') {
  console.log(`${color}${message}${COLORS.reset}`);
}

export function logSection(title) {
  log(`\n${'='.repeat(60)}`, COLORS.cyan);
  log(`${title}`, COLORS.cyan + COLORS.bold);
  log(`${'='.repeat(60)}`, COLORS.cyan);
}
