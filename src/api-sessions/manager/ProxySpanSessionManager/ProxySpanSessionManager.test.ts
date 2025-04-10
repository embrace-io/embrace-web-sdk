import type { HrTime, Span } from '@opentelemetry/api';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { NoOpSpanSessionManager } from '../NoOpSpanSessionManager/index.js';
import type { ReasonSessionEnded, SpanSessionManager } from '../types.js';
import { ProxySpanSessionManager } from './ProxySpanSessionManager.js';

chai.use(sinonChai);
const { expect } = chai;

describe('ProxySpanSessionManager', () => {
  let proxySpanSessionManager: ProxySpanSessionManager;
  let mockDelegate: SpanSessionManager;

  beforeEach(() => {
    proxySpanSessionManager = new ProxySpanSessionManager();
    mockDelegate = {
      getSessionId: sinon.stub().returns('mockSessionId'),
      getSessionSpan: sinon.stub().returns({} as Span),
      getSessionStartTime: sinon.stub().returns([0, 0] as HrTime),
      startSessionSpan: sinon.stub(),
      endSessionSpan: sinon.stub(),
      endSessionSpanInternal: sinon.stub(),
      addBreadcrumb: sinon.stub(),
      addProperty: sinon.stub(),
    };
  });

  it('should return NoOpSpanSessionManager as default delegate', () => {
    const delegate = proxySpanSessionManager.getDelegate();
    expect(delegate).to.be.instanceOf(NoOpSpanSessionManager);
  });

  it('should set and get the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    const delegate = proxySpanSessionManager.getDelegate();
    expect(delegate).to.equal(mockDelegate);
  });

  it('should delegate getSessionId to the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    const sessionId = proxySpanSessionManager.getSessionId();
    expect(sessionId).to.equal('mockSessionId');
  });

  it('should delegate getSessionSpan to the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    const sessionSpan = proxySpanSessionManager.getSessionSpan();
    expect(sessionSpan).to.deep.equal({});
  });

  it('should delegate getSessionStartTime to the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    const sessionStartTime = proxySpanSessionManager.getSessionStartTime();
    expect(sessionStartTime).to.deep.equal([0, 0]);
  });

  it('should delegate startSessionSpan to the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.startSessionSpan();
    void expect(mockDelegate.startSessionSpan).to.have.been.calledOnce;
  });

  it('should delegate endSessionSpan to the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.endSessionSpan();
    void expect(mockDelegate.endSessionSpan).to.have.been.calledOnce;
  });

  it('should delegate endSessionSpanInternal to the delegate with unknown reason', () => {
    const reason: ReasonSessionEnded = 'unknown';
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.endSessionSpanInternal(reason);
    expect(mockDelegate.endSessionSpanInternal).to.have.been.calledOnceWith(
      reason
    );
  });
  it('should delegate endSessionSpanInternal to the delegate with inactivity reason', () => {
    const reason: ReasonSessionEnded = 'inactivity';
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.endSessionSpanInternal(reason);
    expect(mockDelegate.endSessionSpanInternal).to.have.been.calledOnceWith(
      reason
    );
  });

  it('should delegate addBreadcrumb to the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.addBreadcrumb('some breadcrumb');
    expect(mockDelegate.addBreadcrumb).to.have.been.calledOnceWith(
      'some breadcrumb'
    );
  });

  it('should delegate addProperty to the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.addProperty('some-custom-key', 'some custom value');
    expect(mockDelegate.addProperty).to.have.been.calledOnceWith(
      'some-custom-key',
      'some custom value'
    );
  });
});
