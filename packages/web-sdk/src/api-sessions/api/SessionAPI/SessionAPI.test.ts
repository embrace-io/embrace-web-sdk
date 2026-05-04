import type { HrTime, Span } from '@opentelemetry/api';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { UserSessionManagerInternal } from '../../../managers/EmbraceUserSessionManager/types.ts';
import type { SessionAPIInstance } from './SessionAPI.ts';
import { SessionAPI } from './SessionAPI.ts';

chai.use(sinonChai);
const { expect } = chai;

afterEach(() => {
  sinon.restore();
  SessionAPI.resetInstance();
});

const createMockUserSessionManager = (): UserSessionManagerInternal => ({
  // Part identity
  getSessionPartId: sinon.stub().returns('partId'),
  getSessionPartStartTime: sinon.stub().returns([0, 0] as HrTime),
  getSessionPartSpan: sinon.stub().returns({} as Span),
  // Part lifecycle
  startSessionPart: sinon.stub(),
  endSessionPart: sinon.stub(),
  endSessionPartInternal: sinon.stub(),
  // Properties / breadcrumbs
  addBreadcrumb: sinon.stub(),
  addProperty: sinon.stub(),
  removeProperty: sinon.stub(),
  // Counters
  incrSessionPartCountForKey: sinon.stub(),
  incrNextSessionPartCountForKey: sinon.stub(),
  // Part listeners
  addSessionPartStartedListener: sinon.stub().returns(() => {}),
  addSessionPartEndedListener: sinon.stub().returns(() => {}),
  // User-session identity
  getUserSessionId: sinon.stub().returns('userSessionId'),
  getPreviousUserSessionId: sinon.stub().returns('prevUserSessionId'),
  getUserSessionStartTime: sinon.stub().returns(1000),
  getUserSessionAttributes: sinon.stub().returns(null),
  getUserSessionIdOverride: sinon.stub().returns(null),
  // User-session lifecycle
  endUserSession: sinon.stub(),
  setSessionId: sinon.stub(),
  addUserSessionStartedListener: sinon.stub().returns(() => {}),
  addUserSessionEndedListener: sinon.stub().returns(() => {}),
  // Deprecated forwarders
  getSessionId: sinon.stub().returns('userSessionId'),
  getPreviousSessionId: sinon.stub().returns('prevUserSessionId'),
  getSessionStartTime: sinon.stub().returns([1, 0] as HrTime),
  endSessionSpan: sinon.stub(),
  getSessionSpan: sinon.stub().returns(null),
  addSessionStartedListener: sinon.stub().returns(() => {}),
  addSessionEndedListener: sinon.stub().returns(() => {}),
  // Tracer wiring
  setTracerProvider: sinon.stub(),
});

describe('SessionAPI', () => {
  let sessionAPI: SessionAPIInstance;

  beforeEach(() => {
    sessionAPI = SessionAPI.getInstance();
  });

  it('should return the same instance', () => {
    const instance1 = SessionAPI.getInstance();
    const instance2 = SessionAPI.getInstance();
    expect(instance1).to.equal(instance2);
  });

  it('should return the registered session manager from getSessionManager', () => {
    const userSessionManager = createMockUserSessionManager();
    sessionAPI.setGlobalUserSessionManager(userSessionManager);
    expect(sessionAPI.getUserSessionManager()).to.equal(userSessionManager);
  });

  it('should forward user session methods to the manager', () => {
    const userSessionManager = createMockUserSessionManager();
    sessionAPI.setGlobalUserSessionManager(userSessionManager);

    expect(sessionAPI.getUserSessionId()).to.equal('userSessionId');
    void expect(userSessionManager.getUserSessionId).to.have.been.calledOnce;

    expect(sessionAPI.getPreviousUserSessionId()).to.equal('prevUserSessionId');
    void expect(userSessionManager.getPreviousUserSessionId).to.have.been
      .calledOnce;

    expect(sessionAPI.getUserSessionStartTime()).to.equal(1000);
    void expect(userSessionManager.getUserSessionStartTime).to.have.been
      .calledOnce;

    sessionAPI.endUserSession();
    void expect(userSessionManager.endUserSession).to.have.been.calledOnce;

    sessionAPI.addUserSessionStartedListener(() => {});
    void expect(userSessionManager.addUserSessionStartedListener).to.have.been
      .calledOnce;

    sessionAPI.addUserSessionEndedListener(() => {});
    void expect(userSessionManager.addUserSessionEndedListener).to.have.been
      .calledOnce;

    sessionAPI.setSessionId('custom-id');
    void expect(userSessionManager.setSessionId).to.have.been.calledOnceWith(
      'custom-id',
    );

    sessionAPI.setSessionId(null);
    void expect(userSessionManager.setSessionId).to.have.been.calledTwice;
  });

  it('should forward property and breadcrumb methods to the manager', () => {
    const userSessionManager = createMockUserSessionManager();
    sessionAPI.setGlobalUserSessionManager(userSessionManager);

    sessionAPI.addBreadcrumb('br-name');
    void expect(userSessionManager.addBreadcrumb).to.have.been.calledOnceWith(
      'br-name',
    );

    sessionAPI.addProperty('key', 'value');
    void expect(userSessionManager.addProperty).to.have.been.calledOnceWith(
      'key',
      'value',
    );

    sessionAPI.removeProperty('key');
    void expect(userSessionManager.removeProperty).to.have.been.calledOnceWith(
      'key',
    );
  });

  it('should forward deprecated methods to user session equivalents', () => {
    const userSessionManager = createMockUserSessionManager();
    sessionAPI.setGlobalUserSessionManager(userSessionManager);

    expect(sessionAPI.getSessionId()).to.equal('userSessionId');
    void expect(userSessionManager.getUserSessionId).to.have.been.calledOnce;

    expect(sessionAPI.getPreviousSessionId()).to.equal('prevUserSessionId');
    void expect(userSessionManager.getPreviousUserSessionId).to.have.been
      .calledOnce;

    void expect(sessionAPI.getSessionStartTime()).to.not.be.null;
    void expect(userSessionManager.getUserSessionStartTime).to.have.been
      .calledOnce;

    sessionAPI.endSessionSpan();
    void expect(userSessionManager.endUserSession).to.have.been.calledOnce;

    sessionAPI.addSessionStartedListener(() => {});
    void expect(userSessionManager.addUserSessionStartedListener).to.have.been
      .calledOnce;

    sessionAPI.addSessionEndedListener(() => {});
    void expect(userSessionManager.addUserSessionEndedListener).to.have.been
      .calledOnce;
  });
});
