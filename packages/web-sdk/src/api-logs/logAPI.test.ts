import { expect } from 'chai';
import { InMemoryStorage } from '../../tests/utils/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceLogManager,
  EmbraceSpanSessionManager,
} from '../managers/index.ts';
import { OTelPerformanceManager } from '../utils/index.ts';
import { log } from './logAPI.ts';

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
      const storage = new InMemoryStorage();
      const perf = new OTelPerformanceManager();
      manager = new EmbraceLogManager({
        spanSessionManager: new EmbraceSpanSessionManager({
          limitManager,
          perf,
          storage,
          visibilityDoc: window.document,
        }),
        limitManager,
        perf,
        storage,
        visibilityDoc: window.document,
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
