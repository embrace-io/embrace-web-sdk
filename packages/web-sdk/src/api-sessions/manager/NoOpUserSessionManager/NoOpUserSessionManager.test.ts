import { expect } from 'chai';
import { NoOpUserSessionManager } from './NoOpUserSessionManager.ts';

describe('NoOpUserSessionManager', () => {
  let manager: NoOpUserSessionManager;

  beforeEach(() => {
    manager = new NoOpUserSessionManager();
  });

  it('should return null for getUserSessionId', () => {
    void expect(manager.getUserSessionId()).to.be.null;
  });

  it('should return null for getPreviousUserSessionId', () => {
    void expect(manager.getPreviousUserSessionId()).to.be.null;
  });

  it('should return null for getUserSessionStartTime', () => {
    void expect(manager.getUserSessionStartTime()).to.be.null;
  });

  it('should do nothing for endUserSession', () => {
    expect(() => manager.endUserSession()).to.not.throw();
  });

  it('should do nothing for setSessionId', () => {
    expect(() => manager.setSessionId('custom')).to.not.throw();
    expect(() => manager.setSessionId(null)).to.not.throw();
  });

  it('should return a no-op unsubscribe for addUserSessionStartedListener', () => {
    const unsubscribe = manager.addUserSessionStartedListener(() => {});
    expect(() => unsubscribe()).to.not.throw();
  });

  it('should return a no-op unsubscribe for addUserSessionEndedListener', () => {
    const unsubscribe = manager.addUserSessionEndedListener(() => {});
    expect(() => unsubscribe()).to.not.throw();
  });

  it('should do nothing for addBreadcrumb', () => {
    expect(() => manager.addBreadcrumb('crumb')).to.not.throw();
  });

  it('should do nothing for addProperty', () => {
    expect(() => manager.addProperty('k', 'v')).to.not.throw();
    expect(() =>
      manager.addProperty('k', 'v', { lifespan: 'permanent' }),
    ).to.not.throw();
  });

  it('should do nothing for removeProperty', () => {
    expect(() => manager.removeProperty('k')).to.not.throw();
  });

  it('should return null for deprecated getSessionId', () => {
    void expect(manager.getSessionId()).to.be.null;
  });

  it('should return null for deprecated getPreviousSessionId', () => {
    void expect(manager.getPreviousSessionId()).to.be.null;
  });

  it('should return null for deprecated getSessionStartTime', () => {
    void expect(manager.getSessionStartTime()).to.be.null;
  });

  it('should do nothing for deprecated endSessionSpan', () => {
    expect(() => manager.endSessionSpan()).to.not.throw();
  });

  it('should return null for deprecated getSessionSpan', () => {
    void expect(manager.getSessionSpan()).to.be.null;
  });

  it('should return a no-op unsubscribe for deprecated addSessionStartedListener', () => {
    const unsubscribe = manager.addSessionStartedListener(() => {});
    expect(() => unsubscribe()).to.not.throw();
  });

  it('should return a no-op unsubscribe for deprecated addSessionEndedListener', () => {
    const unsubscribe = manager.addSessionEndedListener(() => {});
    expect(() => unsubscribe()).to.not.throw();
  });
});
