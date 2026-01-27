import type { HrTime, Span } from '@opentelemetry/api';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { ReasonSessionEnded, SpanSessionManager } from '../index.ts';
import { NoOpSpanSessionManager } from '../NoOpSpanSessionManager/index.ts';
import { ProxySpanSessionManager } from './ProxySpanSessionManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('ProxySpanSessionManager', () => {
  let proxySpanSessionManager: ProxySpanSessionManager;
  let mockDelegate: SpanSessionManager;

  beforeEach(() => {
    proxySpanSessionManager = new ProxySpanSessionManager();
    mockDelegate = {
      getSessionId: sinon.stub().returns('mockSessionId'),
      getPreviousSessionId: sinon.stub().returns('mockPreviousSessionId'),
      getSessionSpan: sinon.stub().returns({} as Span),
      getSessionStartTime: sinon.stub().returns([0, 0] as HrTime),
      startSessionSpan: sinon.stub(),
      endSessionSpan: sinon.stub(),
      endSessionSpanInternal: sinon.stub(),
      currentSessionAsReadableSpan: sinon.stub(),
      addBreadcrumb: sinon.stub(),
      addProperty: sinon.stub(),
      removeProperty: sinon.stub(),
      addSessionStartedListener: sinon.stub(),
      addSessionEndedListener: sinon.stub(),
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

  it('should delegate getPreviousSessionId to the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    const sessionId = proxySpanSessionManager.getPreviousSessionId();
    expect(sessionId).to.equal('mockPreviousSessionId');
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

  it('should delegate startSessionSpan to the delegate with options', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.startSessionSpan({ reason: 'start reason' });
    expect(mockDelegate.startSessionSpan).to.have.been.calledOnceWith({
      reason: 'start reason',
    });
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
      reason,
    );
  });
  it('should delegate endSessionSpanInternal to the delegate with inactivity reason', () => {
    const reason: ReasonSessionEnded = 'inactivity';
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.endSessionSpanInternal(reason);
    expect(mockDelegate.endSessionSpanInternal).to.have.been.calledOnceWith(
      reason,
    );
  });

  it('should delegate addBreadcrumb to the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.addBreadcrumb('some breadcrumb');
    expect(mockDelegate.addBreadcrumb).to.have.been.calledOnceWith(
      'some breadcrumb',
    );
  });

  it('should delegate addProperty to the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.addProperty('some-custom-key', 'some custom value');
    expect(mockDelegate.addProperty).to.have.been.calledOnceWith(
      'some-custom-key',
      'some custom value',
    );
  });

  it('should delegate removeProperty to the delegate', () => {
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.removeProperty('some-custom-key');
    expect(mockDelegate.removeProperty).to.have.been.calledOnceWith(
      'some-custom-key',
    );
  });

  it('should delegate addSessionStartedListener to the delegate', () => {
    const listener = () => {};
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.addSessionStartedListener(listener);
    expect(mockDelegate.addSessionStartedListener).to.have.been.calledOnceWith(
      listener,
    );
  });

  it('should delegate addSessionEndedListener to the delegate', () => {
    const listener = () => {};
    proxySpanSessionManager.setDelegate(mockDelegate);
    proxySpanSessionManager.addSessionEndedListener(listener);
    expect(mockDelegate.addSessionEndedListener).to.have.been.calledOnceWith(
      listener,
    );
  });

  describe('listener queueing', () => {
    it('should queue session started listeners registered before delegate is set', () => {
      const listener1 = sinon.stub();
      const listener2 = sinon.stub();

      // Register listeners before setting delegate
      proxySpanSessionManager.addSessionStartedListener(listener1);
      proxySpanSessionManager.addSessionStartedListener(listener2);

      // Listeners should not have been called yet
      expect(mockDelegate.addSessionStartedListener).not.to.have.been.called;

      // Set delegate - should replay queued listeners
      proxySpanSessionManager.setDelegate(mockDelegate);

      expect(mockDelegate.addSessionStartedListener).to.have.been.calledTwice;
      expect(mockDelegate.addSessionStartedListener).to.have.been.calledWith(
        listener1,
      );
      expect(mockDelegate.addSessionStartedListener).to.have.been.calledWith(
        listener2,
      );
    });

    it('should queue session ended listeners registered before delegate is set', () => {
      const listener1 = sinon.stub();
      const listener2 = sinon.stub();

      // Register listeners before setting delegate
      proxySpanSessionManager.addSessionEndedListener(listener1);
      proxySpanSessionManager.addSessionEndedListener(listener2);

      // Listeners should not have been called yet
      expect(mockDelegate.addSessionEndedListener).not.to.have.been.called;

      // Set delegate - should replay queued listeners
      proxySpanSessionManager.setDelegate(mockDelegate);

      expect(mockDelegate.addSessionEndedListener).to.have.been.calledTwice;
      expect(mockDelegate.addSessionEndedListener).to.have.been.calledWith(
        listener1,
      );
      expect(mockDelegate.addSessionEndedListener).to.have.been.calledWith(
        listener2,
      );
    });

    it('should allow unsubscribing from pending session started listeners', () => {
      const listener = sinon.stub();

      // Register listener before setting delegate
      const unsubscribe =
        proxySpanSessionManager.addSessionStartedListener(listener);

      // Unsubscribe before delegate is set
      unsubscribe();

      // Set delegate - listener should not be replayed
      proxySpanSessionManager.setDelegate(mockDelegate);

      expect(mockDelegate.addSessionStartedListener).not.to.have.been.called;
    });

    it('should allow unsubscribing from pending session ended listeners', () => {
      const listener = sinon.stub();

      // Register listener before setting delegate
      const unsubscribe =
        proxySpanSessionManager.addSessionEndedListener(listener);

      // Unsubscribe before delegate is set
      unsubscribe();

      // Set delegate - listener should not be replayed
      proxySpanSessionManager.setDelegate(mockDelegate);

      expect(mockDelegate.addSessionEndedListener).not.to.have.been.called;
    });

    it('should clear pending listeners after delegate is set', () => {
      const listener = sinon.stub();

      // Register listener before setting delegate
      proxySpanSessionManager.addSessionStartedListener(listener);

      // Set delegate first time
      proxySpanSessionManager.setDelegate(mockDelegate);
      expect(mockDelegate.addSessionStartedListener).to.have.been.calledOnce;

      // Create a new mock delegate
      const newMockDelegate = {
        ...mockDelegate,
        addSessionStartedListener: sinon.stub(),
        addSessionEndedListener: sinon.stub(),
      };

      // Set delegate second time - should not replay again
      proxySpanSessionManager.setDelegate(newMockDelegate);
      expect(newMockDelegate.addSessionStartedListener).not.to.have.been.called;
    });
  });
});
