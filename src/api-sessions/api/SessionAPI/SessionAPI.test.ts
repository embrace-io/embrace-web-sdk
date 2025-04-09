import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  ProxySpanSessionManager,
  type SpanSessionManager,
} from '../../manager/index.js';
import { SessionAPI } from './SessionAPI.js';

afterEach(() => {
  sinon.restore();
});
describe('SessionAPI', () => {
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
    };
    sessionAPI.setGlobalSessionManager(sessionManager);
    const result = sessionAPI.getSpanSessionManager();
    expect(result).to.be.instanceOf(ProxySpanSessionManager);
    expect((result as ProxySpanSessionManager).getDelegate()).to.equal(
      sessionManager
    );
  });
});
