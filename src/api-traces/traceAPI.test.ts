import { expect } from 'chai';
import { EmbraceTraceManager } from '../managers';
import { trace } from './traceAPI.js';

describe('traceAPI', () => {
  it('should export a trace instance with expected methods', () => {
    expect(trace).to.have.property('startSpan');
    expect(trace).to.have.property('setSpan');
    expect(trace).to.have.property('setGlobalTraceManager');
  });

  describe('incorrect usage', () => {
    let manager: EmbraceTraceManager;

    type IncorrectUsageTest = {
      name: string;
      invocation: () => unknown;
    };

    const tests: IncorrectUsageTest[] = [
      {
        name: 'startSpan',
        // @ts-expect-error
        invocation: () => trace.startSpan(undefined),
      },
      {
        name: 'setSpan',
        // @ts-expect-error
        invocation: () => trace.setSpan(undefined, null),
      },
      {
        name: 'getSpan',
        // @ts-expect-error
        invocation: () => trace.getSpan(null),
      },
    ];

    beforeEach(() => {
      manager = new EmbraceTraceManager();
      trace.setGlobalTraceManager(manager);
    });

    tests.forEach((test) => {
      it(`${test.name} should handle incorrect usage`, async () => {
        expect(() => {
          test.invocation();
        }).to.not.throw();
      });
    });
  });
});
