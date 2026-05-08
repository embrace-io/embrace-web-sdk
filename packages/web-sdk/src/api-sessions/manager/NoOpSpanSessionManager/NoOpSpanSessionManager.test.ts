import { expect } from 'chai';
import { NoOpSpanSessionManager } from './NoOpSpanSessionManager.ts';

describe('NoOpSpanSessionManager', () => {
  let noOpSpanSessionManager: NoOpSpanSessionManager;

  beforeEach(() => {
    noOpSpanSessionManager = new NoOpSpanSessionManager();
  });

  it('should return null for getUserSessionId', () => {
    void expect(noOpSpanSessionManager.getUserSessionId()).to.be.null;
  });

  it('should return null for getPreviousUserSessionId', () => {
    void expect(noOpSpanSessionManager.getPreviousUserSessionId()).to.be.null;
  });

  it('should return null for getUserSessionStartTime', () => {
    void expect(noOpSpanSessionManager.getUserSessionStartTime()).to.be.null;
  });

  it('should do nothing for endUserSession', () => {
    expect(() => noOpSpanSessionManager.endUserSession()).to.not.throw();
  });

  it('should do nothing for setSessionId', () => {
    expect(() => noOpSpanSessionManager.setSessionId('custom')).to.not.throw();
    expect(() => noOpSpanSessionManager.setSessionId(null)).to.not.throw();
  });

  it('should do nothing for addBreadcrumb', () => {
    expect(() => noOpSpanSessionManager.addBreadcrumb('crumb')).to.not.throw();
  });

  it('should do nothing for addProperty', () => {
    expect(() => noOpSpanSessionManager.addProperty('k', 'v')).to.not.throw();
    expect(() =>
      noOpSpanSessionManager.addProperty('k', 'v', { lifespan: 'permanent' }),
    ).to.not.throw();
  });

  it('should do nothing for removeProperty', () => {
    expect(() => noOpSpanSessionManager.removeProperty('k')).to.not.throw();
  });

  it('should return null for deprecated getSessionId', () => {
    void expect(noOpSpanSessionManager.getSessionId()).to.be.null;
  });

  it('should return null for deprecated getPreviousSessionId', () => {
    void expect(noOpSpanSessionManager.getPreviousSessionId()).to.be.null;
  });

  it('should return null for deprecated getSessionStartTime', () => {
    void expect(noOpSpanSessionManager.getSessionStartTime()).to.be.null;
  });

  it('should do nothing for deprecated endSessionSpan', () => {
    expect(() => noOpSpanSessionManager.endSessionSpan()).to.not.throw();
  });

  it('should return null for deprecated getSessionSpan', () => {
    void expect(noOpSpanSessionManager.getSessionSpan()).to.be.null;
  });

  it('should return a no-op unsubscribe for deprecated addSessionStartedListener', () => {
    const unsubscribe = noOpSpanSessionManager.addSessionStartedListener(
      () => {},
    );
    expect(() => unsubscribe()).to.not.throw();
  });

  it('should return a no-op unsubscribe for deprecated addSessionEndedListener', () => {
    const unsubscribe = noOpSpanSessionManager.addSessionEndedListener(
      () => {},
    );
    expect(() => unsubscribe()).to.not.throw();
  });
});
