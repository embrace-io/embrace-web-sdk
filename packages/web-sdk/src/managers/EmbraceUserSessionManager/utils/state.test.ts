import * as chai from 'chai';
import {
  createEndedUserSessionState,
  createUserSessionState,
  isUserSessionEnded,
} from './state.ts';

const { expect } = chai;

describe('user session state', () => {
  const NOW = 1_700_000_000_000;

  const createState = (userSessionId?: string) =>
    createUserSessionState({
      now: NOW,
      userSessionId,
      previousUserSessionId: null,
      userSessionMaxDurationSeconds: 43200,
      userSessionInactivityTimeoutSeconds: 1800,
      userSessionForegroundInactivityTimeoutSeconds: 1800,
      userSessionNumber: 1,
    });

  it('pre-generates the next user session ID', () => {
    const state = createState();

    expect(state.nextUserSessionId).to.have.lengthOf(32);
    expect(state.nextUserSessionId).to.not.equal(state.userSessionId);
  });

  it('uses the given user session ID', () => {
    expect(createState('A'.repeat(32)).userSessionId).to.equal('A'.repeat(32));
  });

  it("isn't ended while it's within its deadlines", () => {
    void expect(isUserSessionEnded(createState(), NOW)).to.be.false;
  });

  it('is ended when marked ended, before any deadline', () => {
    void expect(isUserSessionEnded({ ...createState(), ended: true }, NOW)).to
      .be.true;
  });

  it("isn't ended when it starts up to a minute ahead of the clock", () => {
    void expect(isUserSessionEnded(createState(), NOW - 60_000)).to.be.false;
  });

  it('is ended when it starts more than a minute ahead of the clock', () => {
    void expect(isUserSessionEnded(createState(), NOW - 60_001)).to.be.true;
  });

  it('ends a user session as an expired row without properties', () => {
    const ended = createEndedUserSessionState(
      { ...createState(), userSessionProperties: { plan: 'pro' } },
      NOW + 1000,
      'manual',
    );

    expect(ended).to.deep.include({
      ended: true,
      endReason: 'manual',
      inactivityDeadlineTs: NOW + 1000,
      userSessionProperties: {},
    });
    // SDK versions without `ended` see it as expired.
    void expect(isUserSessionEnded({ ...ended, ended: undefined }, NOW + 1000))
      .to.be.true;
  });
});
