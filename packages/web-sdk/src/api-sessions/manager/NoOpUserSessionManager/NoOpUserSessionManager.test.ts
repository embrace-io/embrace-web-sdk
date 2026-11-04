import { expect } from 'chai';
import { NoOpUserSessionManager } from './NoOpUserSessionManager.ts';

describe('NoOpUserSessionManager', () => {
  let noOpUserSessionManager: NoOpUserSessionManager;

  beforeEach(() => {
    noOpUserSessionManager = new NoOpUserSessionManager();
  });

  it('should do nothing for addBreadcrumb', () => {
    expect(() => {
      noOpUserSessionManager.addBreadcrumb('name');
    }).to.not.throw();
  });

  it('should do nothing for addProperty', () => {
    expect(() => {
      noOpUserSessionManager.addProperty(
        'some-custom-key',
        'some custom value',
      );
    }).to.not.throw();
  });

  it('should do nothing for removeProperty', () => {
    expect(() => {
      noOpUserSessionManager.removeProperty('some-custom-key');
    }).to.not.throw();
  });

  it('should return null for getUserSessionId', () => {
    void expect(noOpUserSessionManager.getUserSessionId()).to.be.null;
  });

  it('should return null for getPreviousUserSessionId', () => {
    void expect(noOpUserSessionManager.getPreviousUserSessionId()).to.be.null;
  });

  it('should return null for getUserSessionStartTime', () => {
    void expect(noOpUserSessionManager.getUserSessionStartTime()).to.be.null;
  });

  it('should do nothing for endUserSession', () => {
    expect(() => {
      noOpUserSessionManager.endUserSession();
    }).to.not.throw();
  });

  it('should do nothing for rolloverSessionPartInternal', () => {
    expect(() => {
      noOpUserSessionManager.rolloverSessionPartInternal({
        endReason: 'web_soft_navigation',
        startReason: 'web_soft_navigation',
      });
    }).to.not.throw();
  });
});
