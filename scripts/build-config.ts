// Shared build configuration utilities

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

export function log(message: string, color = '') {
  console.log(`${color}${message}${COLORS.reset}`);
}

export function logSection(title: string) {
  log(`\n${'='.repeat(60)}`, COLORS.cyan);
  log(`${title}`, COLORS.cyan + COLORS.bold);
  log(`${'='.repeat(60)}`, COLORS.cyan);
}
