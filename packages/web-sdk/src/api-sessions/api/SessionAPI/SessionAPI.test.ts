import type { Span } from '@opentelemetry/api';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { SpanSessionManagerInternal } from '../../../managers/EmbraceUserSessionManager/types.ts';
import type { SessionAPIInstance } from './SessionAPI.ts';
import { SessionAPI } from './SessionAPI.ts';

chai.use(sinonChai);
const { expect } = chai;

afterEach(() => {
  sinon.restore();
  SessionAPI.resetInstance();
});

const createMockSpanSessionManager = (): SpanSessionManagerInternal => ({
  // Part identity
  getSessionPartId: sinon.stub().returns('partId'),
  getSessionPartSpan: sinon.stub().returns({} as Span),
  // Part lifecycle
  startSessionPartInternal: sinon.stub(),
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
  getSessionPartProperties: sinon.stub().returns({}),
  // User-session lifecycle
  endUserSession: sinon.stub(),
  // Deprecated forwarders (delegated to underlying manager)
  getSessionId: sinon.stub().returns('userSessionId'),
  getPreviousSessionId: sinon.stub().returns(null),
  getSessionStartTime: sinon.stub().returns(1000),
  endSessionSpan: sinon.stub(),
  startSessionSpan: sinon.stub(),
  getSessionSpan: sinon.stub().returns({} as Span),
  addSessionStartedListener: sinon.stub().returns(() => {}),
  addSessionEndedListener: sinon.stub().returns(() => {}),
  currentSessionAsReadableSpan: sinon.stub().returns(null),
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

  it('should return a proxy from getSpanSessionManager that forwards to the registered manager', () => {
    const spanSessionManager = createMockSpanSessionManager();
    sessionAPI.setGlobalSessionManager(spanSessionManager);
    const returned = sessionAPI.getSpanSessionManager();
    void expect(returned.getSessionPartId()).to.equal('partId');
    void expect(spanSessionManager.getSessionPartId).to.have.been.calledOnce;
  });

  it('should forward user session methods to the manager', () => {
    const spanSessionManager = createMockSpanSessionManager();
    sessionAPI.setGlobalSessionManager(spanSessionManager);

    expect(sessionAPI.getUserSessionId()).to.equal('userSessionId');
    void expect(spanSessionManager.getUserSessionId).to.have.been.calledOnce;

    expect(sessionAPI.getPreviousUserSessionId()).to.equal('prevUserSessionId');
    void expect(spanSessionManager.getPreviousUserSessionId).to.have.been
      .calledOnce;

    expect(sessionAPI.getUserSessionStartTime()).to.equal(1000);
    void expect(spanSessionManager.getUserSessionStartTime).to.have.been
      .calledOnce;

    sessionAPI.endUserSession();
    void expect(spanSessionManager.endUserSession).to.have.been.calledOnce;
  });

  it('should forward property and breadcrumb methods to the manager', () => {
    const spanSessionManager = createMockSpanSessionManager();
    sessionAPI.setGlobalSessionManager(spanSessionManager);

    sessionAPI.addBreadcrumb('br-name');
    void expect(spanSessionManager.addBreadcrumb).to.have.been.calledOnceWith(
      'br-name',
    );

    sessionAPI.addProperty('key', 'value');
    void expect(spanSessionManager.addProperty).to.have.been.calledOnceWith(
      'key',
      'value',
    );

    sessionAPI.removeProperty('key');
    void expect(spanSessionManager.removeProperty).to.have.been.calledOnceWith(
      'key',
    );
  });

  it('should forward deprecated getSessionId, getSessionStartTime, getSessionSpan to the manager', () => {
    const spanSessionManager = createMockSpanSessionManager();
    sessionAPI.setGlobalSessionManager(spanSessionManager);

    expect(sessionAPI.getSessionId()).to.equal('userSessionId');
    void expect(spanSessionManager.getSessionId).to.have.been.calledOnce;

    expect(sessionAPI.getSessionStartTime()).to.equal(1000);
    void expect(spanSessionManager.getSessionStartTime).to.have.been.calledOnce;

    void expect(sessionAPI.getSessionSpan()).to.not.be.null;
    void expect(spanSessionManager.getSessionSpan).to.have.been.calledOnce;
  });

  it('should return null for deprecated getPreviousSessionId without delegating and noop deprecated listeners/startSessionSpan', () => {
    const spanSessionManager = createMockSpanSessionManager();
    sessionAPI.setGlobalSessionManager(spanSessionManager);

    void expect(sessionAPI.getPreviousSessionId()).to.be.null;
    expect(() => sessionAPI.addSessionStartedListener(() => {})).to.not.throw();
    expect(() => sessionAPI.addSessionEndedListener(() => {})).to.not.throw();
    expect(() => sessionAPI.startSessionSpan()).to.not.throw();
  });

  it('should forward endSessionSpan to the manager', () => {
    const spanSessionManager = createMockSpanSessionManager();
    sessionAPI.setGlobalSessionManager(spanSessionManager);

    sessionAPI.endSessionSpan();
    void expect(spanSessionManager.endSessionSpan).to.have.been.calledOnce;
  });
});
