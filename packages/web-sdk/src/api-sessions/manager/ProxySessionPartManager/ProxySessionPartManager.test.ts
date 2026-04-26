import type { HrTime, Span } from '@opentelemetry/api';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type {
  SessionPartEndReason,
  SessionPartManager,
  SessionPartStartReason,
} from '../index.ts';
import { NoOpSessionPartManager } from '../NoOpSessionPartManager/index.ts';
import { ProxySessionPartManager } from './ProxySessionPartManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('ProxySessionPartManager', () => {
  let proxySessionPartManager: ProxySessionPartManager;
  let mockDelegate: SessionPartManager;

  beforeEach(() => {
    proxySessionPartManager = new ProxySessionPartManager();
    mockDelegate = {
      getSessionPartId: sinon.stub().returns('mockSessionId'),
      getPreviousSessionPartId: sinon.stub().returns('mockPreviousSessionId'),
      getSessionPartSpan: sinon.stub().returns({} as Span),
      getSessionPartStartTime: sinon.stub().returns([0, 0] as HrTime),
      startSessionPart: sinon.stub(),
      endSessionPart: sinon.stub(),
      endSessionPartInternal: sinon.stub(),
      addBreadcrumb: sinon.stub(),
      addProperty: sinon.stub(),
      removeProperty: sinon.stub(),
      addSessionPartStartedListener: sinon.stub(),
      addSessionPartEndedListener: sinon.stub(),
      incrSessionPartCountForKey: sinon.stub(),
      incrNextSessionPartCountForKey: sinon.stub(),
    };
  });

  it('should return NoOpSessionPartManager as default delegate', () => {
    const delegate = proxySessionPartManager.getDelegate();
    expect(delegate).to.be.instanceOf(NoOpSessionPartManager);
  });

  it('should set and get the delegate', () => {
    proxySessionPartManager.setDelegate(mockDelegate);
    const delegate = proxySessionPartManager.getDelegate();
    expect(delegate).to.equal(mockDelegate);
  });

  it('should delegate getSessionId to the delegate', () => {
    proxySessionPartManager.setDelegate(mockDelegate);
    const sessionId = proxySessionPartManager.getSessionPartId();
    expect(sessionId).to.equal('mockSessionId');
  });

  it('should delegate getPreviousSessionId to the delegate', () => {
    proxySessionPartManager.setDelegate(mockDelegate);
    const sessionId = proxySessionPartManager.getPreviousSessionPartId();
    expect(sessionId).to.equal('mockPreviousSessionId');
  });

  it('should delegate getSessionSpan to the delegate', () => {
    proxySessionPartManager.setDelegate(mockDelegate);
    const sessionPartSpan = proxySessionPartManager.getSessionPartSpan();
    expect(sessionPartSpan).to.deep.equal({});
  });

  it('should delegate getSessionStartTime to the delegate', () => {
    proxySessionPartManager.setDelegate(mockDelegate);
    const sessionStartTime = proxySessionPartManager.getSessionPartStartTime();
    expect(sessionStartTime).to.deep.equal([0, 0]);
  });

  it('should delegate startSessionPart to the delegate with init reason', () => {
    const reason: SessionPartStartReason = 'init';
    proxySessionPartManager.setDelegate(mockDelegate);
    proxySessionPartManager.startSessionPart(reason);
    expect(mockDelegate.startSessionPart).to.have.been.calledOnceWith(reason);
  });

  it('should delegate startSessionPart to the delegate with activity reason', () => {
    const reason: SessionPartStartReason = 'activity';
    proxySessionPartManager.setDelegate(mockDelegate);
    proxySessionPartManager.startSessionPart(reason);
    expect(mockDelegate.startSessionPart).to.have.been.calledOnceWith(reason);
  });

  it('should delegate startSessionPart to the delegate with user_session_rollover reason', () => {
    const reason: SessionPartStartReason = 'user_session_rollover';
    proxySessionPartManager.setDelegate(mockDelegate);
    proxySessionPartManager.startSessionPart(reason);
    expect(mockDelegate.startSessionPart).to.have.been.calledOnceWith(reason);
  });

  it('should delegate endSessionPart to the delegate', () => {
    proxySessionPartManager.setDelegate(mockDelegate);
    proxySessionPartManager.endSessionPart();
    void expect(mockDelegate.endSessionPart).to.have.been.calledOnce;
  });

  it('should delegate endSessionPartInternal to the delegate with manual reason', () => {
    const reason: SessionPartEndReason = 'manual';
    proxySessionPartManager.setDelegate(mockDelegate);
    proxySessionPartManager.endSessionPartInternal(reason);
    expect(mockDelegate.endSessionPartInternal).to.have.been.calledOnceWith(
      reason,
    );
  });
  it('should delegate endSessionPartInternal to the delegate with inactivity reason', () => {
    const reason: SessionPartEndReason = 'inactivity';
    proxySessionPartManager.setDelegate(mockDelegate);
    proxySessionPartManager.endSessionPartInternal(reason);
    expect(mockDelegate.endSessionPartInternal).to.have.been.calledOnceWith(
      reason,
    );
  });

  it('should delegate addBreadcrumb to the delegate', () => {
    proxySessionPartManager.setDelegate(mockDelegate);
    proxySessionPartManager.addBreadcrumb('some breadcrumb');
    expect(mockDelegate.addBreadcrumb).to.have.been.calledOnceWith(
      'some breadcrumb',
    );
  });

  it('should delegate addProperty to the delegate', () => {
    proxySessionPartManager.setDelegate(mockDelegate);
    proxySessionPartManager.addProperty('some-custom-key', 'some custom value');
    expect(mockDelegate.addProperty).to.have.been.calledOnceWith(
      'some-custom-key',
      'some custom value',
    );
  });

  it('should delegate removeProperty to the delegate', () => {
    proxySessionPartManager.setDelegate(mockDelegate);
    proxySessionPartManager.removeProperty('some-custom-key');
    expect(mockDelegate.removeProperty).to.have.been.calledOnceWith(
      'some-custom-key',
    );
  });

  it('should delegate addSessionPartStartedListener to the delegate', () => {
    const listener = () => {};
    proxySessionPartManager.setDelegate(mockDelegate);
    proxySessionPartManager.addSessionPartStartedListener(listener);
    expect(
      mockDelegate.addSessionPartStartedListener,
    ).to.have.been.calledOnceWith(listener);
  });

  it('should delegate addSessionPartEndedListener to the delegate', () => {
    const listener = () => {};
    proxySessionPartManager.setDelegate(mockDelegate);
    proxySessionPartManager.addSessionPartEndedListener(listener);
    expect(
      mockDelegate.addSessionPartEndedListener,
    ).to.have.been.calledOnceWith(listener);
  });
});
