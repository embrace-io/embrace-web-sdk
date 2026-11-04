import type { DiagLogger } from '@opentelemetry/api';
import { DiagLogLevel, diag } from '@opentelemetry/api';
import * as sinon from 'sinon';

type StubbedDiagLogger = { [Level in keyof DiagLogger]: sinon.SinonStub };

/**
 * Installs a stub logger on the global diag channel and returns it. Component
 * loggers prepend their namespace, so a call arrives as
 * `(namespace, message, ...args)`. Call `diag.disable()` in `afterEach`.
 */
export const setupTestDiagLogger = (): StubbedDiagLogger => {
  const logger: StubbedDiagLogger = {
    error: sinon.stub(),
    warn: sinon.stub(),
    info: sinon.stub(),
    debug: sinon.stub(),
    verbose: sinon.stub(),
  };
  diag.setLogger(logger, {
    logLevel: DiagLogLevel.ALL,
    suppressOverrideMessage: true,
  });
  return logger;
};
