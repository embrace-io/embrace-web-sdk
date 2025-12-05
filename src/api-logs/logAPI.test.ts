import { expect } from 'chai';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceLogManager,
  EmbraceSpanSessionManager,
} from '../managers';
import { log } from './logAPI.js';

describe('logAPI', () => {
  it('should export a log instance with expected methods', () => {
    expect(log).to.have.property('message');
    expect(log).to.have.property('logException');
    expect(log).to.have.property('setGlobalLogManager');
  });

  describe('incorrect usage', () => {
    let manager: EmbraceLogManager;

    type IncorrectUsageTest = {
      name: string;
      invocation: () => unknown;
    };

    const tests: IncorrectUsageTest[] = [
      {
        name: 'message',
        // @ts-expect-error
        invocation: () => log.message('foo', null),
      },
    ];

    beforeEach(() => {
      const limitManager = new EmbraceLimitManager({ ...DEFAULT_LIMITS });
      manager = new EmbraceLogManager({
        spanSessionManager: new EmbraceSpanSessionManager({ limitManager }),
        limitManager,
      });
      log.setGlobalLogManager(manager);
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
