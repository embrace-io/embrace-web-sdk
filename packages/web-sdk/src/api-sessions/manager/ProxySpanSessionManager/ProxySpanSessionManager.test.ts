import type { Span } from '@opentelemetry/api';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { SpanSessionManagerInternal } from '../../../managers/EmbraceSpanSessionManager/types.ts';
import { ProxySpanSessionManager } from './ProxySpanSessionManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('ProxySpanSessionManager', () => {
  let proxySpanSessionManager: ProxySpanSessionManager;
  let spanSessionManager: SpanSessionManagerInternal;

  beforeEach(() => {
    proxySpanSessionManager = new ProxySpanSessionManager();
    spanSessionManager = {
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
      getUserSessionId: sinon.stub().returns('user-id'),
      getPreviousUserSessionId: sinon.stub().returns('prev-user-id'),
      getUserSessionStartTime: sinon.stub().returns(123_456),
      getUserSessionAttributes: sinon.stub().returns(null),
      getUserSessionIdOverride: sinon.stub().returns(null),
      // User-session lifecycle
      endUserSession: sinon.stub(),
      setSessionId: sinon.stub(),
      // Deprecated forwarders (delegated to underlying manager)
      getSessionId: sinon.stub().returns('user-id'),
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

    it('should drop pre-init setSessionId calls without delegating', () => {
      proxySpanSessionManager.setSessionId('pre-init-id');
      proxySpanSessionManager.setDelegate(spanSessionManager);

      // Pre-init values are not buffered; the delegate only sees calls made
      // after setDelegate installs it.
      expect(spanSessionManager.setSessionId).to.not.have.been.called;
    });

    it('should not throw on pre-init setSessionId(null)', () => {
      expect(() => proxySpanSessionManager.setSessionId(null)).to.not.throw();
    });
  });

  describe('after setDelegate', () => {
    beforeEach(() => {
      proxySpanSessionManager.setDelegate(spanSessionManager);
    });

    it('should delegate user session identity to the spanSessionManager', () => {
      expect(proxySpanSessionManager.getUserSessionId()).to.equal('user-id');
      expect(proxySpanSessionManager.getPreviousUserSessionId()).to.equal(
        'prev-user-id',
      );
      expect(proxySpanSessionManager.getUserSessionStartTime()).to.equal(
        123_456,
      );
    });

    it('should delegate endUserSession to the spanSessionManager', () => {
      proxySpanSessionManager.endUserSession();
      expect(spanSessionManager.endUserSession).to.have.been.calledOnce;
    });

    it('should delegate setSessionId to the spanSessionManager', () => {
      proxySpanSessionManager.setSessionId('custom-id');
      expect(spanSessionManager.setSessionId).to.have.been.calledOnceWith(
        'custom-id',
      );
    });

    it('should delegate setSessionId(null) to the spanSessionManager', () => {
      proxySpanSessionManager.setSessionId(null);
      expect(spanSessionManager.setSessionId).to.have.been.calledOnceWith(null);
    });

    it('should delegate addBreadcrumb to the spanSessionManager', () => {
      proxySpanSessionManager.addBreadcrumb('crumb');
      expect(spanSessionManager.addBreadcrumb).to.have.been.calledOnceWith(
        'crumb',
      );
    });

    it('should delegate addProperty to the spanSessionManager', () => {
      proxySpanSessionManager.addProperty('k', 'v');
      expect(spanSessionManager.addProperty).to.have.been.calledOnceWith(
        'k',
        'v',
        undefined,
      );
    });

    it('should delegate addProperty with permanent option to the spanSessionManager', () => {
      proxySpanSessionManager.addProperty('k', 'v', { lifespan: 'permanent' });
      expect(spanSessionManager.addProperty).to.have.been.calledOnceWith(
        'k',
        'v',
        {
          lifespan: 'permanent',
        },
      );
    });

    it('should delegate removeProperty to the spanSessionManager', () => {
      proxySpanSessionManager.removeProperty('k');
      expect(spanSessionManager.removeProperty).to.have.been.calledOnceWith(
        'k',
      );
    });

    it('should forward deprecated getSessionId to the spanSessionManager', () => {
      expect(proxySpanSessionManager.getSessionId()).to.equal('user-id');
      void expect(spanSessionManager.getSessionId).to.have.been.calledOnce;
    });

    it('should return null from deprecated getPreviousSessionId without delegating', () => {
      void expect(proxySpanSessionManager.getPreviousSessionId()).to.be.null;
      void expect(spanSessionManager.getPreviousSessionId).to.not.have.been
        .called;
    });

    it('should forward deprecated getSessionStartTime to the spanSessionManager', () => {
      expect(proxySpanSessionManager.getSessionStartTime()).to.equal(123_456);
      void expect(spanSessionManager.getSessionStartTime).to.have.been
        .calledOnce;
    });

    it('should forward deprecated getSessionSpan to the spanSessionManager', () => {
      void expect(proxySpanSessionManager.getSessionSpan()).to.not.be.null;
      void expect(spanSessionManager.getSessionSpan).to.have.been.calledOnce;
    });

    it('should delegate endSessionSpan to the spanSessionManager', () => {
      proxySpanSessionManager.endSessionSpan();
      expect(spanSessionManager.endSessionSpan).to.have.been.calledOnce;
    });

    it('should no-op startSessionSpan without delegating', () => {
      proxySpanSessionManager.startSessionSpan();
      void expect(spanSessionManager.startSessionSpan).to.not.have.been.called;
    });

    it('should return a no-op unsubscribe from deprecated session listeners without delegating', () => {
      const u1 = proxySpanSessionManager.addSessionStartedListener(() => {});
      const u2 = proxySpanSessionManager.addSessionEndedListener(() => {});
      expect(() => u1()).to.not.throw();
      expect(() => u2()).to.not.throw();
      void expect(spanSessionManager.addSessionStartedListener).to.not.have.been
        .called;
      void expect(spanSessionManager.addSessionEndedListener).to.not.have.been
        .called;
    });
  });

  describe('getDelegate', () => {
    it('should return the registered delegate after setDelegate', () => {
      proxySpanSessionManager.setDelegate(spanSessionManager);
      expect(proxySpanSessionManager.getDelegate()).to.equal(
        spanSessionManager,
      );
    });
  });
});
