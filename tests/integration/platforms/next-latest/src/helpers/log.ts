import { log } from '@embrace-io/web-sdk';

const embraceLevelMapping = {
  info: 'info' as const,
  error: 'error' as const,
  warn: 'warning' as const,
  debug: 'info' as const,
};

const logMessage = (
  level: 'info' | 'error' | 'warn' | 'debug',
  message: string,
  ...optionalParams: unknown[]
) => {
  console[level](message, optionalParams);
  log.message(message, embraceLevelMapping[level]);
};

export const logError = (message: string, ...optionalParams: unknown[]) =>
  logMessage('error', message, ...optionalParams);
export const logInfo = (message: string, ...optionalParams: unknown[]) =>
  logMessage('info', message, ...optionalParams);
export const logWarn = (message: string, ...optionalParams: unknown[]) =>
  logMessage('warn', message, ...optionalParams);
export const logDebug = (message: string, ...optionalParams: unknown[]) =>
  logMessage('debug', message, ...optionalParams);
