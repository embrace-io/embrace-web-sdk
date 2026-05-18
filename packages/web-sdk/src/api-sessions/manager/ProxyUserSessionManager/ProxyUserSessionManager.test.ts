import type { Span } from '@opentelemetry/api';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { SpanSessionManagerInternal } from '../../../managers/EmbraceUserSessionManager/types.ts';
import { ProxySpanSessionManager } from './ProxyUserSessionManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('ProxySpanSessionManager', () => {
  let proxySpanSessionManager: ProxySpanSessionManager;
  let mockDelegate: SpanSessionManagerInternal;

  beforeEach(() => {
    proxySpanSessionManager = new ProxySpanSessionManager();
    mockDelegate = {
      // Part identity
      getSessionPartId: sinon.stub().returns('part-id'),
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
      getUserSessionId: sinon.stub().returns('mockSessionId'),
      getPreviousUserSessionId: sinon.stub().returns('prev-user-id'),
      getUserSessionStartTime: sinon.stub().returns(123_456),
      getUserSessionAttributes: sinon.stub().returns(null),
      getSessionPartProperties: sinon.stub().returns({}),
      // User-session lifecycle
      endUserSession: sinon.stub(),
      // Deprecated forwarders (delegated to underlying manager)
      getSessionId: sinon.stub().returns('mockSessionId'),
      getPreviousSessionId: sinon.stub().returns(null),
      getSessionStartTime: sinon.stub().returns(123_456),
      endSessionSpan: sinon.stub(),
      startSessionSpan: sinon.stub(),
      getSessionSpan: sinon.stub().returns({} as Span),
      addSessionStartedListener: sinon.stub().returns(() => {}),
      addSessionEndedListener: sinon.stub().returns(() => {}),
      currentSessionAsReadableSpan: sinon.stub().returns(null),
      // Tracer wiring
      setTracerProvider: sinon.stub(),
    };
  });

  describe('before setDelegate', () => {
    it('should return null for user session identity', () => {
      void expect(proxySpanSessionManager.getUserSessionId()).to.be.null;
      void expect(proxySpanSessionManager.getPreviousUserSessionId()).to.be
        .null;
      void expect(proxySpanSessionManager.getUserSessionStartTime()).to.be.null;
    });

    it('should not throw for lifecycle methods', () => {
      expect(() => proxySpanSessionManager.endUserSession()).to.not.throw();
    });
  });

  describe('after setDelegate', () => {
    beforeEach(() => {
      proxySpanSessionManager.setDelegate(mockDelegate);
    });

    it('should delegate user session identity to the spanSessionManager', () => {
      expect(proxySpanSessionManager.getUserSessionId()).to.equal(
        'mockSessionId',
      );
      expect(proxySpanSessionManager.getPreviousUserSessionId()).to.equal(
        'prev-user-id',
      );
      expect(proxySpanSessionManager.getUserSessionStartTime()).to.equal(
        123_456,
      );
    });

    it('should delegate endUserSession to the spanSessionManager', () => {
      proxySpanSessionManager.endUserSession();
      expect(mockDelegate.endUserSession).to.have.been.calledOnce;
    });

    it('should delegate addBreadcrumb to the spanSessionManager', () => {
      proxySpanSessionManager.addBreadcrumb('some breadcrumb');
      expect(mockDelegate.addBreadcrumb).to.have.been.calledOnceWith(
        'some breadcrumb',
      );
    });

    it('should delegate addProperty to the spanSessionManager', () => {
      proxySpanSessionManager.addProperty(
        'some-custom-key',
        'some custom value',
      );
      expect(mockDelegate.addProperty).to.have.been.calledOnceWith(
        'some-custom-key',
        'some custom value',
        undefined,
      );
    });

    it('should delegate addProperty with permanent option to the spanSessionManager', () => {
      proxySpanSessionManager.addProperty(
        'some-custom-key',
        'some custom value',
        {
          lifespan: 'permanent',
        },
      );
      expect(mockDelegate.addProperty).to.have.been.calledOnceWith(
        'some-custom-key',
        'some custom value',
        {
          lifespan: 'permanent',
        },
      );
    });

    it('should delegate removeProperty to the spanSessionManager', () => {
      proxySpanSessionManager.removeProperty('some-custom-key');
      expect(mockDelegate.removeProperty).to.have.been.calledOnceWith(
        'some-custom-key',
      );
    });

    it('should forward deprecated getSessionId to the spanSessionManager', () => {
      expect(proxySpanSessionManager.getSessionId()).to.equal('mockSessionId');
      void expect(mockDelegate.getSessionId).to.have.been.calledOnce;
    });

    it('should return null from deprecated getPreviousSessionId without delegating', () => {
      void expect(proxySpanSessionManager.getPreviousSessionId()).to.be.null;
      void expect(mockDelegate.getPreviousSessionId).to.not.have.been.called;
    });

    it('should forward deprecated getSessionStartTime to the spanSessionManager', () => {
      expect(proxySpanSessionManager.getSessionStartTime()).to.equal(123_456);
      void expect(mockDelegate.getSessionStartTime).to.have.been.calledOnce;
    });

    it('should forward deprecated getSessionSpan to the spanSessionManager', () => {
      void expect(proxySpanSessionManager.getSessionSpan()).to.not.be.null;
      void expect(mockDelegate.getSessionSpan).to.have.been.calledOnce;
    });

    it('should delegate endSessionSpan to the spanSessionManager', () => {
      proxySpanSessionManager.endSessionSpan();
      expect(mockDelegate.endSessionSpan).to.have.been.calledOnce;
    });

    it('should no-op startSessionSpan without delegating', () => {
      proxySpanSessionManager.startSessionSpan();
      void expect(mockDelegate.startSessionSpan).to.not.have.been.called;
    });

    it('should return a no-op unsubscribe from deprecated session listeners without delegating', () => {
      const u1 = proxySpanSessionManager.addSessionStartedListener(() => {});
      const u2 = proxySpanSessionManager.addSessionEndedListener(() => {});
      expect(() => u1()).to.not.throw();
      expect(() => u2()).to.not.throw();
      void expect(mockDelegate.addSessionStartedListener).to.not.have.been
        .called;
      void expect(mockDelegate.addSessionEndedListener).to.not.have.been.called;
    });
  });

  describe('getDelegate', () => {
    it('should return the registered delegate after setDelegate', () => {
      proxySpanSessionManager.setDelegate(mockDelegate);
      expect(proxySpanSessionManager.getDelegate()).to.equal(mockDelegate);
    });
  });
});
