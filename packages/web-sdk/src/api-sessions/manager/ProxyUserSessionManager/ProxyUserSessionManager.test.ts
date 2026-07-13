import type { Span } from '@opentelemetry/api';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { UserSessionManagerInternal } from '../../../managers/EmbraceUserSessionManager/types.ts';
import { ProxyUserSessionManager } from './ProxyUserSessionManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('ProxyUserSessionManager', () => {
  let proxyUserSessionManager: ProxyUserSessionManager;
  let mockDelegate: UserSessionManagerInternal;

  beforeEach(() => {
    proxyUserSessionManager = new ProxyUserSessionManager();
    mockDelegate = {
      // Part identity
      getSessionPartId: sinon.stub().returns('part-id'),
      getSessionPartSpan: sinon.stub().returns({} as Span),
      // Part lifecycle
      startSessionPartInternal: sinon.stub(),
      endSessionPartInternal: sinon.stub(),
      rolloverSessionPartInternal: sinon.stub(),
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
      void expect(proxyUserSessionManager.getUserSessionId()).to.be.null;
      void expect(proxyUserSessionManager.getPreviousUserSessionId()).to.be
        .null;
      void expect(proxyUserSessionManager.getUserSessionStartTime()).to.be.null;
    });

    it('should not throw for lifecycle methods', () => {
      expect(() => proxyUserSessionManager.endUserSession()).to.not.throw();
    });
  });

  describe('after setDelegate', () => {
    beforeEach(() => {
      proxyUserSessionManager.setDelegate(mockDelegate);
    });

    it('should delegate user session identity to the userSessionManager', () => {
      expect(proxyUserSessionManager.getUserSessionId()).to.equal(
        'mockSessionId',
      );
      expect(proxyUserSessionManager.getPreviousUserSessionId()).to.equal(
        'prev-user-id',
      );
      expect(proxyUserSessionManager.getUserSessionStartTime()).to.equal(
        123_456,
      );
    });

    it('should delegate endUserSession to the userSessionManager', () => {
      proxyUserSessionManager.endUserSession();
      expect(mockDelegate.endUserSession).to.have.been.calledOnce;
    });

    it('should delegate rolloverSessionPartInternal to the userSessionManager', () => {
      const options = {
        endReason: 'web_soft_navigation' as const,
        startReason: 'web_soft_navigation' as const,
      };
      proxyUserSessionManager.rolloverSessionPartInternal(options);
      expect(
        mockDelegate.rolloverSessionPartInternal,
      ).to.have.been.calledOnceWith(options);
    });

    it('should delegate addBreadcrumb to the userSessionManager', () => {
      proxyUserSessionManager.addBreadcrumb('some breadcrumb');
      expect(mockDelegate.addBreadcrumb).to.have.been.calledOnceWith(
        'some breadcrumb',
      );
    });

    it('should delegate addProperty to the userSessionManager', () => {
      proxyUserSessionManager.addProperty(
        'some-custom-key',
        'some custom value',
      );
      expect(mockDelegate.addProperty).to.have.been.calledOnceWith(
        'some-custom-key',
        'some custom value',
        undefined,
      );
    });

    it('should delegate addProperty with permanent option to the userSessionManager', () => {
      proxyUserSessionManager.addProperty(
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

    it('should delegate removeProperty to the userSessionManager', () => {
      proxyUserSessionManager.removeProperty('some-custom-key');
      expect(mockDelegate.removeProperty).to.have.been.calledOnceWith(
        'some-custom-key',
      );
    });

    it('should forward deprecated getSessionId to the userSessionManager', () => {
      expect(proxyUserSessionManager.getSessionId()).to.equal('mockSessionId');
      void expect(mockDelegate.getSessionId).to.have.been.calledOnce;
    });

    it('should return null from deprecated getPreviousSessionId without delegating', () => {
      void expect(proxyUserSessionManager.getPreviousSessionId()).to.be.null;
      void expect(mockDelegate.getPreviousSessionId).to.not.have.been.called;
    });

    it('should forward deprecated getSessionStartTime to the userSessionManager', () => {
      expect(proxyUserSessionManager.getSessionStartTime()).to.equal(123_456);
      void expect(mockDelegate.getSessionStartTime).to.have.been.calledOnce;
    });

    it('should forward deprecated getSessionSpan to the userSessionManager', () => {
      void expect(proxyUserSessionManager.getSessionSpan()).to.not.be.null;
      void expect(mockDelegate.getSessionSpan).to.have.been.calledOnce;
    });

    it('should delegate endSessionSpan to the userSessionManager', () => {
      proxyUserSessionManager.endSessionSpan();
      expect(mockDelegate.endSessionSpan).to.have.been.calledOnce;
    });

    it('should no-op startSessionSpan without delegating', () => {
      proxyUserSessionManager.startSessionSpan();
      void expect(mockDelegate.startSessionSpan).to.not.have.been.called;
    });

    it('should return a no-op unsubscribe from deprecated session listeners without delegating', () => {
      const u1 = proxyUserSessionManager.addSessionStartedListener(() => {});
      const u2 = proxyUserSessionManager.addSessionEndedListener(() => {});
      expect(() => u1()).to.not.throw();
      expect(() => u2()).to.not.throw();
      void expect(mockDelegate.addSessionStartedListener).to.not.have.been
        .called;
      void expect(mockDelegate.addSessionEndedListener).to.not.have.been.called;
    });
  });

  describe('getDelegate', () => {
    it('should return the registered delegate after setDelegate', () => {
      proxyUserSessionManager.setDelegate(mockDelegate);
      expect(proxyUserSessionManager.getDelegate()).to.equal(mockDelegate);
    });
  });
});
