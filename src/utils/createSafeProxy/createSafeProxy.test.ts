import * as chai from 'chai';
import { InMemoryDiagLogger } from '../../testUtils/index.js';
import { createSafeProxy } from './createSafeProxy.js';

const { expect } = chai;

interface TestManager {
  getValue(): string;
  setValue(value: string): void;
  getOptional(): string | null;
}

class NoOpTestManager implements TestManager {
  getValue(): string {
    return 'noop-value';
  }
  setValue(_value: string): void {}
  getOptional(): string | null {
    return null;
  }
}

describe('createSafeProxy', () => {
  let diagLogger: InMemoryDiagLogger;
  let noOpManager: NoOpTestManager;

  beforeEach(() => {
    diagLogger = new InMemoryDiagLogger();
    noOpManager = new NoOpTestManager();
  });

  it('should forward successful method calls', () => {
    const target: TestManager = {
      getValue: () => 'real-value',
      setValue: () => {},
      getOptional: () => 'optional-value',
    };

    const proxy = createSafeProxy(target, noOpManager, diagLogger);

    expect(proxy.getValue()).to.equal('real-value');
    expect(proxy.getOptional()).to.equal('optional-value');
    expect(diagLogger.getErrorLogs()).to.deep.equal([]);
  });

  it('should catch errors and return NoOp fallback value', () => {
    const target: TestManager = {
      getValue: () => {
        throw new Error('getValue failed');
      },
      setValue: () => {},
      getOptional: () => null,
    };

    const proxy = createSafeProxy(target, noOpManager, diagLogger);

    expect(proxy.getValue()).to.equal('noop-value');
    expect(diagLogger.getErrorLogs()).to.deep.equal([
      'getValue: getValue failed',
    ]);
  });

  it('should handle non-Error throws', () => {
    const target: TestManager = {
      getValue: () => {
        throw 'string error';
      },
      setValue: () => {},
      getOptional: () => null,
    };

    const proxy = createSafeProxy(target, noOpManager, diagLogger);

    expect(proxy.getValue()).to.equal('noop-value');
    expect(diagLogger.getErrorLogs()).to.deep.equal([
      'getValue: Unknown error',
    ]);
  });

  it('should not wrap excluded methods', () => {
    const target = {
      getValue: () => {
        throw new Error('getValue failed');
      },
      internalMethod: () => {
        throw new Error('internal failed');
      },
    };

    const noOp = {
      getValue: () => 'noop',
      internalMethod: () => 'noop-internal',
    };

    const proxy = createSafeProxy(
      target,
      noOp,
      diagLogger,
      new Set(['internalMethod']),
    );

    // getValue should be wrapped and return fallback
    expect(proxy.getValue()).to.equal('noop');

    // internalMethod should NOT be wrapped and should throw
    expect(() => proxy.internalMethod()).to.throw('internal failed');
  });

  it('should pass arguments to both target and fallback', () => {
    let receivedValue = '';
    const target: TestManager = {
      getValue: () => 'value',
      setValue: (value: string) => {
        receivedValue = value;
      },
      getOptional: () => null,
    };

    const proxy = createSafeProxy(target, noOpManager, diagLogger);

    proxy.setValue('test-value');
    expect(receivedValue).to.equal('test-value');
  });
});
