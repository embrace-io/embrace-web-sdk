import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  ProxySpanSessionManager,
  type SpanSessionManager,
} from '../../manager/index.js';
import { SessionAPI } from './SessionAPI.js';
import type { HrTime, Span } from '@opentelemetry/api';
import sinonChai from 'sinon-chai';

chai.use(sinonChai);
const { expect } = chai;

afterEach(() => {
  sinon.restore();
});

describe('SessionAPI', () => {
  let sessionAPI: SessionAPI;

  beforeEach(() => {
    sessionAPI = SessionAPI.getInstance();
  });

  it('should return the same instance', () => {
    const instance1 = SessionAPI.getInstance();
    const instance2 = SessionAPI.getInstance();
    expect(instance1).to.equal(instance2);
  });

  it('should return the global session manager', () => {
    const sessionAPI = SessionAPI.getInstance();
    const sessionManager: SpanSessionManager = {
      // Mock implementation of SpanSessionManager
      getSessionId: sinon.stub().returns('mockSessionId'),
      getSessionStartTime: sinon.stub().returns(1234567890),
      getSessionSpan: sinon.stub().returns('mockSpanId'),
      startSessionSpan: sinon.stub(),
      endSessionSpan: sinon.stub(),
      endSessionSpanInternal: sinon.stub(),
      addBreadcrumb: sinon.stub(),
      addProperty: sinon.stub(),
    };
    sessionAPI.setGlobalSessionManager(sessionManager);
    const result = sessionAPI.getSpanSessionManager();
    expect(result).to.be.instanceOf(ProxySpanSessionManager);
    expect((result as ProxySpanSessionManager).getDelegate()).to.equal(
      sessionManager
    );
  });

  it('should forward calls to the session manager', () => {
    const mockSpanSessionManager: SpanSessionManager = {
      getSessionId: sinon.stub().returns('mockSessionId'),
      getSessionSpan: sinon.stub().returns({} as Span),
      getSessionStartTime: sinon.stub().returns([0, 0] as HrTime),
      startSessionSpan: sinon.stub(),
      endSessionSpan: sinon.stub(),
      endSessionSpanInternal: sinon.stub(),
      addBreadcrumb: sinon.stub(),
      addProperty: sinon.stub(),
    };
    sessionAPI.setGlobalSessionManager(mockSpanSessionManager);

    void expect(sessionAPI.getSessionId()).to.not.be.null;
    void expect(mockSpanSessionManager.getSessionId).to.have.been.calledOnce;

    void expect(sessionAPI.getSessionSpan()).to.not.be.null;
    void expect(mockSpanSessionManager.getSessionSpan).to.have.been.calledOnce;

    void expect(sessionAPI.getSessionStartTime()).to.not.be.null;
    void expect(mockSpanSessionManager.getSessionStartTime).to.have.been
      .calledOnce;

    sessionAPI.startSessionSpan();
    void expect(mockSpanSessionManager.startSessionSpan).to.have.been
      .calledOnce;

    sessionAPI.endSessionSpan();
    void expect(mockSpanSessionManager.endSessionSpan).to.have.been.calledOnce;

    sessionAPI.endSessionSpanInternal('timer');
    void expect(
      mockSpanSessionManager.endSessionSpanInternal
    ).to.have.been.calledOnceWith('timer');

    sessionAPI.addBreadcrumb('br-name');
    void expect(
      mockSpanSessionManager.addBreadcrumb
    ).to.have.been.calledOnceWith('br-name');

    sessionAPI.addProperty('custom-key', 'custom value');
    void expect(mockSpanSessionManager.addProperty).to.have.been.calledOnceWith(
      'custom-key',
      'custom value'
    );
  });
});
