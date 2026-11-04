import type { DiagLogger } from '@opentelemetry/api';
import { DiagLogLevel, diag } from '@opentelemetry/api';
import * as sinon from 'sinon';

type DiagLevel = keyof DiagLogger;

type TestDiagLogger = { [Level in DiagLevel]: sinon.SinonStub } & {
  /**
   * The messages that the component logger for `namespace` logged at `level`,
   * in call order. Other components also log to the global diag, so tests
   * assert on one namespace.
   */
  messagesFrom(level: DiagLevel, namespace: string): unknown[];
};

/**
 * Installs a stub logger on the global diag channel and returns it. Component
 * loggers prepend their namespace, so a call arrives as
 * `(namespace, message, ...args)`. Call `diag.disable()` in `afterEach`.
 */
export const setupTestDiagLogger = (): TestDiagLogger => {
  const stubs = {
    error: sinon.stub(),
    warn: sinon.stub(),
    info: sinon.stub(),
    debug: sinon.stub(),
    verbose: sinon.stub(),
  };
  const logger: TestDiagLogger = {
    ...stubs,
    messagesFrom: (level, namespace) =>
      stubs[level].args
        .filter(([callNamespace]) => callNamespace === namespace)
        .map(([, message]) => message),
  };
  diag.setLogger(logger, {
    logLevel: DiagLogLevel.ALL,
    suppressOverrideMessage: true,
  });
  return logger;
};
