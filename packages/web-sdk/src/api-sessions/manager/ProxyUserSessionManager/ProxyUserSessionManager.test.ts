import type { HrTime, Span } from '@opentelemetry/api';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { UserSessionLifecycleManager } from '../../../managers/EmbraceUserSessionManager/types.ts';
import { ProxySessionPartManager } from '../ProxySessionPartManager/index.ts';
import type { SessionPartManager } from '../types.ts';
import { ProxyUserSessionManager } from './ProxyUserSessionManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('ProxyUserSessionManager', () => {
  let proxy: ProxyUserSessionManager;
  let part: SessionPartManager;
  let lifecycle: UserSessionLifecycleManager;

  beforeEach(() => {
    proxy = new ProxyUserSessionManager();
    part = {
      getSessionPartId: sinon.stub().returns('part-id'),
      getPreviousSessionPartId: sinon.stub().returns('prev-part-id'),
      getSessionPartSpan: sinon.stub().returns({} as Span),
      getSessionPartStartTime: sinon.stub().returns([1, 2] as HrTime),
      startSessionPart: sinon.stub(),
      endSessionPart: sinon.stub(),
      endSessionPartInternal: sinon.stub(),
      addBreadcrumb: sinon.stub(),
      addProperty: sinon.stub(),
      removeProperty: sinon.stub(),
      addSessionPartStartedListener: sinon.stub().returns(() => {}),
      addSessionPartEndedListener: sinon.stub().returns(() => {}),
      incrSessionPartCountForKey: sinon.stub(),
      incrNextSessionPartCountForKey: sinon.stub(),
    };
    lifecycle = {
      getUserSessionId: sinon.stub().returns('user-id'),
      getPreviousUserSessionId: sinon.stub().returns('prev-user-id'),
      getUserSessionStartTime: sinon.stub().returns(123_456),
      getUserSessionAttributes: sinon.stub().returns(null),
      getSessionIds: sinon.stub().returns({
        sessionId: 'user-id',
        sessionPreviousId: 'prev-user-id',
        userSessionId: 'user-id',
        userSessionPreviousId: 'prev-user-id',
      }),
      onSessionPartStart: sinon.stub().returns({
        'session.id': 'user-id',
        'emb.user_session_id': 'user-id',
        'emb.user_session_number': 1,
        'emb.user_session_part_number': 1,
        'emb.user_session_start_ts': 0,
        'emb.user_session_max_duration_seconds': 43200,
        'emb.user_session_inactivity_timeout_seconds': 1800,
      }),
      onSessionPartEnd: sinon.stub(),
      setSessionPartCallbacks: sinon.stub(),
      getTerminationInfo: sinon
        .stub()
        .returns({ isFinal: false, reason: null }),
      endUserSession: sinon.stub(),
      setSessionId: sinon.stub(),
      addUserSessionStartedListener: sinon.stub().returns(() => {}),
      addUserSessionEndedListener: sinon.stub().returns(() => {}),
    };
  });

  describe('before setDelegates', () => {
    it('should return null for user session identity', () => {
      void expect(proxy.getUserSessionId()).to.be.null;
      void expect(proxy.getPreviousUserSessionId()).to.be.null;
      void expect(proxy.getUserSessionStartTime()).to.be.null;
    });

    it('should return null for session part identity', () => {
      void expect(proxy.getSessionPartId()).to.be.null;
      void expect(proxy.getPreviousSessionPartId()).to.be.null;
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
      proxy.setDelegates(part, lifecycle);

      // Pre-init values are not buffered; the lifecycle manager only sees
      // calls made after setDelegates installs it.
      expect(lifecycle.setSessionId).to.not.have.been.called;
    });

    it('should not throw on pre-init setSessionId(null)', () => {
      expect(() => proxy.setSessionId(null)).to.not.throw();
    });
  });

  describe('after setDelegates', () => {
    beforeEach(() => {
      proxy.setDelegates(part, lifecycle);
    });

    it('should delegate user session identity to the lifecycle manager', () => {
      expect(proxy.getUserSessionId()).to.equal('user-id');
      expect(proxy.getPreviousUserSessionId()).to.equal('prev-user-id');
      expect(proxy.getUserSessionStartTime()).to.equal(123_456);
    });

    it('should delegate session part identity to the part manager', () => {
      expect(proxy.getSessionPartId()).to.equal('part-id');
      expect(proxy.getPreviousSessionPartId()).to.equal('prev-part-id');
    });

    it('should delegate endUserSession to the lifecycle manager', () => {
      proxy.endUserSession();
      expect(lifecycle.endUserSession).to.have.been.calledOnce;
    });

    it('should delegate setSessionId to the lifecycle manager', () => {
      proxy.setSessionId('custom-id');
      expect(lifecycle.setSessionId).to.have.been.calledOnceWith('custom-id');
    });

    it('should delegate setSessionId(null) to the lifecycle manager', () => {
      proxy.setSessionId(null);
      expect(lifecycle.setSessionId).to.have.been.calledOnceWith(null);
    });

    it('should delegate listeners to the lifecycle manager', () => {
      const listener = () => {};
      proxy.addUserSessionStartedListener(listener);
      proxy.addUserSessionEndedListener(listener);
      expect(lifecycle.addUserSessionStartedListener).to.have.been.calledWith(
        listener,
      );
      expect(lifecycle.addUserSessionEndedListener).to.have.been.calledWith(
        listener,
      );
    });

    it('should delegate addBreadcrumb to the part manager', () => {
      proxy.addBreadcrumb('crumb');
      expect(part.addBreadcrumb).to.have.been.calledOnceWith('crumb');
    });

    it('should delegate addUserSessionProperty to the part manager', () => {
      proxy.addUserSessionProperty('k', 'v');
      expect(part.addProperty).to.have.been.calledOnceWith('k', 'v', undefined);
    });

    it('should delegate addUserSessionProperty with options to the part manager', () => {
      proxy.addUserSessionProperty('k', 'v', { lifespan: 'permanent' });
      expect(part.addProperty).to.have.been.calledOnceWith('k', 'v', {
        lifespan: 'permanent',
      });
    });

    it('should pass lifespan permanent for addPermanentUserSessionProperty', () => {
      proxy.addPermanentUserSessionProperty('k', 'v');
      expect(part.addProperty).to.have.been.calledOnceWith('k', 'v', {
        lifespan: 'permanent',
      });
    });

    it('should delegate removeUserSessionProperty to the part manager', () => {
      proxy.removeUserSessionProperty('k');
      expect(part.removeProperty).to.have.been.calledOnceWith('k');
    });

    it('should forward deprecated addProperty to addUserSessionProperty', () => {
      proxy.addProperty('k', 'v');
      expect(part.addProperty).to.have.been.calledOnceWith('k', 'v', undefined);
    });

    it('should forward deprecated removeProperty to removeUserSessionProperty', () => {
      proxy.removeProperty('k');
      expect(part.removeProperty).to.have.been.calledOnceWith('k');
    });

    it('should forward deprecated getSessionId to getUserSessionId', () => {
      expect(proxy.getSessionId()).to.equal('user-id');
    });

    it('should forward deprecated getPreviousSessionId to getPreviousUserSessionId', () => {
      expect(proxy.getPreviousSessionId()).to.equal('prev-user-id');
    });

    it('should forward deprecated endSessionSpan to endUserSession', () => {
      proxy.endSessionSpan();
      expect(lifecycle.endUserSession).to.have.been.calledOnce;
    });

    it('should forward deprecated getSessionSpan to part.getSessionPartSpan', () => {
      expect(proxy.getSessionSpan()).to.deep.equal({});
    });

    it('should forward deprecated session listeners to user session listeners', () => {
      const listener = () => {};
      proxy.addSessionStartedListener(listener);
      proxy.addSessionEndedListener(listener);
      expect(lifecycle.addUserSessionStartedListener).to.have.been.calledWith(
        listener,
      );
      expect(lifecycle.addUserSessionEndedListener).to.have.been.calledWith(
        listener,
      );
    });

    describe('deprecated getSessionStartTime HrTime conversion', () => {
      it('should return null when the lifecycle manager has no start time', () => {
        (lifecycle.getUserSessionStartTime as sinon.SinonStub).returns(null);
        void expect(proxy.getSessionStartTime()).to.be.null;
      });

      it('should convert whole-second millis exactly', () => {
        (lifecycle.getUserSessionStartTime as sinon.SinonStub).returns(2000);
        expect(proxy.getSessionStartTime()).to.deep.equal([2, 0]);
      });

      it('should split ms into seconds and nanoseconds', () => {
        (lifecycle.getUserSessionStartTime as sinon.SinonStub).returns(1500);
        expect(proxy.getSessionStartTime()).to.deep.equal([1, 500_000_000]);
      });

      it('should handle sub-second values', () => {
        (lifecycle.getUserSessionStartTime as sinon.SinonStub).returns(1);
        expect(proxy.getSessionStartTime()).to.deep.equal([0, 1_000_000]);
      });

      it('should handle zero', () => {
        (lifecycle.getUserSessionStartTime as sinon.SinonStub).returns(0);
        expect(proxy.getSessionStartTime()).to.deep.equal([0, 0]);
      });
    });
  });

  describe('setDelegates with only part manager', () => {
    it('should keep the no-op lifecycle delegate for user session methods', () => {
      proxy.setDelegates(part);
      void expect(proxy.getUserSessionId()).to.be.null;
      void expect(proxy.getPreviousUserSessionId()).to.be.null;
      void expect(proxy.getUserSessionStartTime()).to.be.null;
    });
  });

  describe('getPartDelegate and getLifecycleDelegate', () => {
    it('should expose a stable proxy that forwards to the registered part delegate', () => {
      const beforeSet = proxy.getPartDelegate();
      expect(beforeSet).to.be.instanceOf(ProxySessionPartManager);

      proxy.setDelegates(part, lifecycle);

      expect(proxy.getPartDelegate()).to.equal(beforeSet);
      expect(
        (proxy.getPartDelegate() as ProxySessionPartManager).getDelegate(),
      ).to.equal(part);
    });

    it('should expose the registered lifecycle delegate', () => {
      proxy.setDelegates(part, lifecycle);
      expect(proxy.getLifecycleDelegate()).to.equal(lifecycle);
    });
  });
});
