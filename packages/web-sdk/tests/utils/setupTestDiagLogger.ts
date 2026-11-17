import type { DiagLogger } from '@opentelemetry/api';
import { DiagLogLevel, diag } from '@opentelemetry/api';
import * as sinon from 'sinon';

type DiagLevel = keyof DiagLogger;

type TestDiagLogger = { [Level in DiagLevel]: sinon.SinonStub } & {
  /**
   * The message (the first argument after the namespace) of each call that the
   * component logger for the namespace made at `level`, in call order.
   */
  messages(level: DiagLevel): unknown[];
  /**
   * The arguments after the namespace of each call that the component logger
   * for the namespace made at `level`, in call order. Use it where an argument
   * after the message matters, such as the caught error.
   */
  calls(level: DiagLevel): unknown[][];
};

/**
 * Installs a stub logger on the global diag channel and returns it. Component
 * loggers prepend their namespace, so a call arrives as
 * `(namespace, message, ...args)`. Other components also log to the global diag
 * channel, so `messages` and `calls` return only the calls from `namespace`.
 * Call `diag.disable()` in `afterEach`.
 */
export const setupTestDiagLogger = ({
  namespace,
}: {
  namespace: string;
}): TestDiagLogger => {
  const stubs = {
    error: sinon.stub(),
    warn: sinon.stub(),
    info: sinon.stub(),
    debug: sinon.stub(),
    verbose: sinon.stub(),
  };
  const calls = (level: DiagLevel): unknown[][] =>
    stubs[level].args
      .filter(([callNamespace]) => callNamespace === namespace)
      .map(([, ...args]) => args);
  const logger: TestDiagLogger = {
    ...stubs,
    messages: (level) => calls(level).map(([message]) => message),
    calls,
  };
  diag.setLogger(logger, {
    logLevel: DiagLogLevel.ALL,
    suppressOverrideMessage: true,
  });
  return logger;
};
