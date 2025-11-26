import { expect } from 'chai';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSpanSessionManager,
} from '../managers';
import { SessionAPI } from './api/index.js';
import { session } from './sessionAPI.js';

describe('sessionAPI', () => {
  it('should export an instance of SessionAPI', () => {
    expect(session).to.be.instanceOf(SessionAPI);
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
