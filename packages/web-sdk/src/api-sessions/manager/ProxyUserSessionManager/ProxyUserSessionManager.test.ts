import type { HrTime, Span } from '@opentelemetry/api';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { UserSessionManagerInternal } from '../../../managers/EmbraceUserSessionManager/types.ts';
import { ProxyUserSessionManager } from './ProxyUserSessionManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('ProxyUserSessionManager', () => {
  let proxy: ProxyUserSessionManager;
  let userSessionManager: UserSessionManagerInternal;

  beforeEach(() => {
    proxy = new ProxyUserSessionManager();
    userSessionManager = {
      // Part identity
      getSessionPartId: sinon.stub().returns('part-id'),
      getSessionPartSpan: sinon.stub().returns({} as Span),
      getSessionPartStartTime: sinon.stub().returns([1, 2] as HrTime),
      // Part lifecycle
      startSessionPart: sinon.stub(),
      endSessionPart: sinon.stub(),
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
      addUserSessionStartedListener: sinon.stub().returns(() => {}),
      addUserSessionEndedListener: sinon.stub().returns(() => {}),
      // Deprecated forwarders
      getSessionId: sinon.stub().returns('user-id'),
      getPreviousSessionId: sinon.stub().returns('prev-user-id'),
      getSessionStartTime: sinon.stub().returns([123, 456_000_000] as HrTime),
      endSessionSpan: sinon.stub(),
      getSessionSpan: sinon.stub().returns(null),
      addSessionStartedListener: sinon.stub().returns(() => {}),
      addSessionEndedListener: sinon.stub().returns(() => {}),
      // Tracer wiring
      setTracerProvider: sinon.stub(),
    };
  });

  describe('before setUserSessionManager', () => {
    it('should return null for user session identity', () => {
      void expect(proxy.getUserSessionId()).to.be.null;
      void expect(proxy.getPreviousUserSessionId()).to.be.null;
      void expect(proxy.getUserSessionStartTime()).to.be.null;
    });

    it('should not throw for lifecycle methods', () => {
      expect(() => proxy.endUserSession()).to.not.throw();
    });

    it('should return a no-op unsubscribe for listeners', () => {
      const u1 = proxy.addUserSessionStartedListener(() => {});
      const u2 = proxy.addUserSessionEndedListener(() => {});
      expect(() => u1()).to.not.throw();
      expect(() => u2()).to.not.throw();
    });

    it('should drop pre-init setSessionId calls without delegating', () => {
      proxy.setSessionId('pre-init-id');
      proxy.setUserSessionManager(userSessionManager);

      // Pre-init values are not buffered; the delegate only sees calls made
      // after setUserSessionManager installs it.
      expect(userSessionManager.setSessionId).to.not.have.been.called;
    });

    it('should not throw on pre-init setSessionId(null)', () => {
      expect(() => proxy.setSessionId(null)).to.not.throw();
    });
  });

  describe('after setUserSessionManager', () => {
    beforeEach(() => {
      proxy.setUserSessionManager(userSessionManager);
    });

    it('should delegate user session identity to the userSessionManager', () => {
      expect(proxy.getUserSessionId()).to.equal('user-id');
      expect(proxy.getPreviousUserSessionId()).to.equal('prev-user-id');
      expect(proxy.getUserSessionStartTime()).to.equal(123_456);
    });

    it('should delegate endUserSession to the userSessionManager', () => {
      proxy.endUserSession();
      expect(userSessionManager.endUserSession).to.have.been.calledOnce;
    });

    it('should delegate setSessionId to the userSessionManager', () => {
      proxy.setSessionId('custom-id');
      expect(userSessionManager.setSessionId).to.have.been.calledOnceWith(
        'custom-id',
      );
    });

    it('should delegate setSessionId(null) to the userSessionManager', () => {
      proxy.setSessionId(null);
      expect(userSessionManager.setSessionId).to.have.been.calledOnceWith(null);
    });

    it('should delegate listeners to the userSessionManager', () => {
      const listener = () => {};
      proxy.addUserSessionStartedListener(listener);
      proxy.addUserSessionEndedListener(listener);
      expect(
        userSessionManager.addUserSessionStartedListener,
      ).to.have.been.calledWith(listener);
      expect(
        userSessionManager.addUserSessionEndedListener,
      ).to.have.been.calledWith(listener);
    });

    it('should delegate addBreadcrumb to the userSessionManager', () => {
      proxy.addBreadcrumb('crumb');
      expect(userSessionManager.addBreadcrumb).to.have.been.calledOnceWith(
        'crumb',
      );
    });

    it('should delegate addProperty to the userSessionManager', () => {
      proxy.addProperty('k', 'v');
      expect(userSessionManager.addProperty).to.have.been.calledOnceWith(
        'k',
        'v',
        undefined,
      );
    });

    it('should delegate addProperty with permanent option to the userSessionManager', () => {
      proxy.addProperty('k', 'v', { lifespan: 'permanent' });
      expect(userSessionManager.addProperty).to.have.been.calledOnceWith(
        'k',
        'v',
        {
          lifespan: 'permanent',
        },
      );
    });

    it('should delegate removeProperty to the userSessionManager', () => {
      proxy.removeProperty('k');
      expect(userSessionManager.removeProperty).to.have.been.calledOnceWith(
        'k',
      );
    });

    it('should forward deprecated getSessionId to getUserSessionId', () => {
      expect(proxy.getSessionId()).to.equal('user-id');
    });

    it('should forward deprecated getPreviousSessionId to getPreviousUserSessionId', () => {
      expect(proxy.getPreviousSessionId()).to.equal('prev-user-id');
    });

    it('should forward deprecated endSessionSpan to endUserSession', () => {
      proxy.endSessionSpan();
      expect(userSessionManager.endUserSession).to.have.been.calledOnce;
    });

    it('should return null for deprecated getSessionSpan (no part exposure)', () => {
      void expect(proxy.getSessionSpan()).to.be.null;
    });

    it('should forward deprecated session listeners to user session listeners', () => {
      const listener = () => {};
      proxy.addSessionStartedListener(listener);
      proxy.addSessionEndedListener(listener);
      expect(
        userSessionManager.addUserSessionStartedListener,
      ).to.have.been.calledWith(listener);
      expect(
        userSessionManager.addUserSessionEndedListener,
      ).to.have.been.calledWith(listener);
    });

    describe('deprecated getSessionStartTime HrTime conversion', () => {
      it('should return null when the userSessionManager has no start time', () => {
        (userSessionManager.getUserSessionStartTime as sinon.SinonStub).returns(
          null,
        );
        void expect(proxy.getSessionStartTime()).to.be.null;
      });

      it('should convert whole-second millis exactly', () => {
        (userSessionManager.getUserSessionStartTime as sinon.SinonStub).returns(
          2000,
        );
        expect(proxy.getSessionStartTime()).to.deep.equal([2, 0]);
      });

      it('should split ms into seconds and nanoseconds', () => {
        (userSessionManager.getUserSessionStartTime as sinon.SinonStub).returns(
          1500,
        );
        expect(proxy.getSessionStartTime()).to.deep.equal([1, 500_000_000]);
      });

      it('should handle sub-second values', () => {
        (userSessionManager.getUserSessionStartTime as sinon.SinonStub).returns(
          1,
        );
        expect(proxy.getSessionStartTime()).to.deep.equal([0, 1_000_000]);
      });

      it('should handle zero', () => {
        (userSessionManager.getUserSessionStartTime as sinon.SinonStub).returns(
          0,
        );
        expect(proxy.getSessionStartTime()).to.deep.equal([0, 0]);
      });
    });
  });

  describe('getUserSessionManager', () => {
    it('should return the registered delegate after setUserSessionManager', () => {
      proxy.setUserSessionManager(userSessionManager);
      expect(proxy.getUserSessionManager()).to.equal(userSessionManager);
    });
  });
});
