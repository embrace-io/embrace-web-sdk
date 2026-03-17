// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
} as const;

const colorize = (text: string, color: keyof typeof colors): string =>
  `${colors[color]}${text}${colors.reset}`;

export const log = {
  info: (msg: string) => console.log(colorize(msg, 'cyan')),
  success: (msg: string) => console.log(colorize(msg, 'green')),
  warn: (msg: string) => console.log(colorize(msg, 'yellow')),
  error: (msg: string) => console.error(colorize(msg, 'red')),
  dim: (msg: string) => console.log(colorize(msg, 'dim')),
  bold: (msg: string) => console.log(colorize(msg, 'bold')),
};
