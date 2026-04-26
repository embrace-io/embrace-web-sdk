import type { Span } from '@opentelemetry/api';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { UserSessionLifecycleManager } from '../../../managers/EmbraceUserSessionManager/types.ts';
import type { SessionPartManager } from '../../manager/index.ts';
import { ProxySessionPartManager } from '../../manager/index.ts';
import type { SessionAPIInstance } from './SessionAPI.ts';
import { SessionAPI } from './SessionAPI.ts';

chai.use(sinonChai);
const { expect } = chai;

afterEach(() => {
  sinon.restore();
  SessionAPI.resetInstance();
});

const createMockPartManager = (): SessionPartManager => ({
  getSessionPartId: sinon.stub().returns('partId'),
  getPreviousSessionPartId: sinon.stub().returns('prevPartId'),
  getSessionPartStartTime: sinon.stub().returns([0, 0]),
  getSessionPartSpan: sinon.stub().returns({} as Span),
  startSessionPart: sinon.stub(),
  endSessionPart: sinon.stub(),
  endSessionPartInternal: sinon.stub(),
  addBreadcrumb: sinon.stub(),
  addProperty: sinon.stub(),
  removeProperty: sinon.stub(),
  addSessionPartEndedListener: sinon.stub(),
  addSessionPartStartedListener: sinon.stub(),
  incrSessionPartCountForKey: sinon.stub(),
  incrNextSessionPartCountForKey: sinon.stub(),
});

const createMockUserSessionLifecycleManager =
  (): UserSessionLifecycleManager => ({
    getUserSessionId: sinon.stub().returns('userSessionId'),
    getPreviousUserSessionId: sinon.stub().returns('prevUserSessionId'),
    getUserSessionStartTime: sinon.stub().returns(1000),
    getUserSessionAttributes: sinon.stub().returns(null),
    getSessionIds: sinon.stub().returns({
      sessionId: '',
      sessionPreviousId: '',
      userSessionId: '',
      userSessionPreviousId: '',
    }),
    onSessionPartStart: sinon.stub().returns({
      'session.id': '',
      'emb.user_session_id': '',
      'emb.user_session_number': 0,
      'emb.user_session_part_number': 0,
      'emb.user_session_start_ts': 0,
      'emb.user_session_max_duration_seconds': 0,
      'emb.user_session_inactivity_timeout_seconds': 0,
    }),
    onSessionPartEnd: sinon.stub(),
    setSessionPartCallbacks: sinon.stub(),
    getTerminationInfo: sinon.stub().returns({ isFinal: false, reason: null }),
    endUserSession: sinon.stub(),
    setSessionId: sinon.stub(),
    addUserSessionStartedListener: sinon.stub().returns(() => {}),
    addUserSessionEndedListener: sinon.stub().returns(() => {}),
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

  it('should return a proxy session part manager that forwards to the current delegate', () => {
    const sessionPartManager = createMockPartManager();
    const usm = createMockUserSessionLifecycleManager();

    // Capture the proxy before installing the real delegate to prove the
    // reference stays valid across setGlobalManagers calls.
    const result = sessionAPI.getSessionPartManager();
    expect(result).to.be.instanceOf(ProxySessionPartManager);

    sessionAPI.setGlobalManagers(sessionPartManager, usm);
    expect(result.getSessionPartId()).to.equal('partId');
    void expect(sessionPartManager.getSessionPartId).to.have.been.calledOnce;
  });

  it('should forward new user session methods to the user session manager', () => {
    const partManager = createMockPartManager();
    const usm = createMockUserSessionLifecycleManager();
    sessionAPI.setGlobalManagers(partManager, usm);

    expect(sessionAPI.getUserSessionId()).to.equal('userSessionId');
    void expect(usm.getUserSessionId).to.have.been.calledOnce;

    expect(sessionAPI.getPreviousUserSessionId()).to.equal('prevUserSessionId');
    void expect(usm.getPreviousUserSessionId).to.have.been.calledOnce;

    expect(sessionAPI.getUserSessionStartTime()).to.equal(1000);
    void expect(usm.getUserSessionStartTime).to.have.been.calledOnce;

    sessionAPI.endUserSession();
    void expect(usm.endUserSession).to.have.been.calledOnce;

    sessionAPI.addUserSessionStartedListener(() => {});
    void expect(usm.addUserSessionStartedListener).to.have.been.calledOnce;

    sessionAPI.addUserSessionEndedListener(() => {});
    void expect(usm.addUserSessionEndedListener).to.have.been.calledOnce;

    sessionAPI.setSessionId('custom-id');
    void expect(usm.setSessionId).to.have.been.calledOnceWith('custom-id');

    sessionAPI.setSessionId(null);
    void expect(usm.setSessionId).to.have.been.calledTwice;
  });

  it('should forward session part methods to the part manager', () => {
    const partManager = createMockPartManager();
    const usm = createMockUserSessionLifecycleManager();
    sessionAPI.setGlobalManagers(partManager, usm);

    expect(sessionAPI.getSessionPartId()).to.equal('partId');
    void expect(partManager.getSessionPartId).to.have.been.calledOnce;

    expect(sessionAPI.getPreviousSessionPartId()).to.equal('prevPartId');
    void expect(partManager.getPreviousSessionPartId).to.have.been.calledOnce;
  });

  it('should forward unchanged methods to the part manager', () => {
    const partManager = createMockPartManager();
    sessionAPI.setGlobalManagers(partManager);

    sessionAPI.addBreadcrumb('br-name');
    void expect(partManager.addBreadcrumb).to.have.been.calledOnceWith(
      'br-name',
    );

    sessionAPI.addProperty('key', 'value');
    void expect(partManager.addProperty).to.have.been.calledOnceWith(
      'key',
      'value',
    );

    sessionAPI.removeProperty('key');
    void expect(partManager.removeProperty).to.have.been.calledOnceWith('key');
  });

  it('should forward deprecated methods to user session equivalents', () => {
    const partManager = createMockPartManager();
    const usm = createMockUserSessionLifecycleManager();
    sessionAPI.setGlobalManagers(partManager, usm);

    expect(sessionAPI.getSessionId()).to.equal('userSessionId');
    void expect(usm.getUserSessionId).to.have.been.calledOnce;

    expect(sessionAPI.getPreviousSessionId()).to.equal('prevUserSessionId');
    void expect(usm.getPreviousUserSessionId).to.have.been.calledOnce;

    void expect(sessionAPI.getSessionStartTime()).to.not.be.null;
    void expect(usm.getUserSessionStartTime).to.have.been.calledOnce;

    sessionAPI.endSessionSpan();
    void expect(usm.endUserSession).to.have.been.calledOnce;

    sessionAPI.addSessionStartedListener(() => {});
    void expect(usm.addUserSessionStartedListener).to.have.been.calledOnce;

    sessionAPI.addSessionEndedListener(() => {});
    void expect(usm.addUserSessionEndedListener).to.have.been.calledOnce;
  });

  it('should expose a part manager that delegates to the registered one', () => {
    const partManager = createMockPartManager();
    sessionAPI.setGlobalManagers(partManager);

    // getSessionPartManager returns the proxy, not the raw manager; invoking
    // a method on it should reach the underlying partManager stub.
    sessionAPI.getSessionPartManager().getSessionPartId();
    void expect(partManager.getSessionPartId).to.have.been.called;
  });
});
