import { expect } from 'chai';
import { TEST_DYNAMIC_CONFIG_MANAGER } from '../../tests/utils/constants.ts';
import { setupTestStorage } from '../../tests/utils/setupTestStorage.ts';
import { DEFAULT_LIMITS } from '../managers/EmbraceLimitManager/constants.ts';
import { EmbraceLimitManager } from '../managers/EmbraceLimitManager/EmbraceLimitManager.ts';
import { EmbraceUserSessionManager } from '../managers/EmbraceUserSessionManager/EmbraceUserSessionManager.ts';
import { OTelPerformanceManager } from '../utils/PerformanceManager/OTelPerformanceManager.ts';
import { session } from './sessionAPI.ts';

describe('sessionAPI', () => {
  it('should export a session instance with expected methods', () => {
    expect(session).to.have.property('getUserSessionId');
    expect(session).to.have.property('setGlobalUserSessionManager');
    expect(session).to.have.property('addBreadcrumb');
  });

  describe('incorrect usage', () => {
    let manager: EmbraceUserSessionManager;

    type IncorrectUsageTest = {
      name: string;
      invocation: () => unknown;
    };

    const tests: IncorrectUsageTest[] = [
      {
        name: 'addBreadcrumb',
        // @ts-expect-error
        invocation: () => session.addBreadcrumb(undefined),
      },
      {
        name: 'addProperty',
        // @ts-expect-error
        invocation: () => session.addProperty(undefined, undefined),
      },
      {
        name: 'addSessionStartedListener',
        // @ts-expect-error
        invocation: () => session.addSessionStartedListener(null),
      },
      {
        name: 'addSessionEndedListener',
        // @ts-expect-error
        invocation: () => session.addSessionEndedListener(null),
      },
    ];

    beforeEach(() => {
      manager = new EmbraceUserSessionManager({
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
        limitManager: new EmbraceLimitManager({ ...DEFAULT_LIMITS }),
        perf: new OTelPerformanceManager(),
        storage: setupTestStorage(),
        visibilityDoc: window.document,
      });
      manager.startSessionPartInternal({ reason: 'init' });
      session.setGlobalUserSessionManager(manager);
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
