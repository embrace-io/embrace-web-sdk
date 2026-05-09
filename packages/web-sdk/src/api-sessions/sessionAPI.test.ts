import { expect } from 'chai';
import { InMemoryStorage } from '../../tests/utils/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSpanSessionManager,
} from '../managers/index.ts';
import { OTelPerformanceManager } from '../utils/index.ts';
import { session } from './sessionAPI.ts';

describe('sessionAPI', () => {
  it('should export a session instance with expected methods', () => {
    expect(session).to.have.property('getSessionId');
    expect(session).to.have.property('setGlobalSessionManager');
    expect(session).to.have.property('addBreadcrumb');
  });

  describe('incorrect usage', () => {
    let manager: EmbraceSpanSessionManager;

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
        name: 'currentSessionAsReadableSpan',
        // @ts-expect-error
        invocation: () => session.currentSessionAsReadableSpan('not_valid'),
      },
      {
        name: 'startSessionSpan',
        // @ts-expect-error
        invocation: () => session.startSessionSpan(null),
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
      manager = new EmbraceSpanSessionManager({
        limitManager: new EmbraceLimitManager({ ...DEFAULT_LIMITS }),
        perf: new OTelPerformanceManager(),
        storage: new InMemoryStorage(),
        visibilityDoc: window.document,
      });
      manager.startSessionSpan();
      session.setGlobalSessionManager(manager);
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
