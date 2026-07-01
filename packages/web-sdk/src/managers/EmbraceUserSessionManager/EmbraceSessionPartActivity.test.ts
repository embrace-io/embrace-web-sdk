import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  createTestDynamicConfigManager,
  MockPerformanceManager,
  setupTestStorage,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../tests/utils/index.ts';
import type {
  SessionPartEndReason,
  SessionPartStartReason,
} from '../../api-sessions/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
} from '../EmbraceLimitManager/index.ts';
import { EmbraceUserSessionManager } from './EmbraceUserSessionManager.ts';
import type {
  EndSessionPartOptions,
  StartSessionPartOptions,
} from './types.ts';

chai.use(sinonChai);
const { expect } = chai;

const FOREGROUND_INACTIVITY_MS = 30 * 60 * 1000;
const THROTTLE_MS = 30 * 1000;

class FakeTarget implements EventTarget {
  private readonly _listeners = new Map<string, Set<EventListener>>();

  public addEventListener(type: string, listener: EventListener): void {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(listener);
  }

  public removeEventListener(type: string, listener: EventListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  public dispatchEvent(event: Event): boolean {
    for (const listener of this._listeners.get(event.type) ?? []) {
      listener(event);
    }
    return true;
  }

  public listenerCount(type: string): number {
    return this._listeners.get(type)?.size ?? 0;
  }
}

class FakeNavigation {
  private readonly _listeners: Array<
    (event: NavigationCurrentEntryChangeEvent) => void
  > = [];

  public addEventListener(
    _type: 'currententrychange',
    listener: (event: NavigationCurrentEntryChangeEvent) => void,
  ): void {
    this._listeners.push(listener);
  }

  public removeEventListener(
    _type: 'currententrychange',
    listener: (event: NavigationCurrentEntryChangeEvent) => void,
  ): void {
    const i = this._listeners.indexOf(listener);
    if (i !== -1) {
      this._listeners.splice(i, 1);
    }
  }

  public fire(from: string): void {
    const event = Object.assign(new Event('currententrychange'), {
      from: { url: from },
    }) as NavigationCurrentEntryChangeEvent;
    for (const listener of [...this._listeners]) {
      listener(event);
    }
  }

  public listenerCount(): number {
    return this._listeners.length;
  }
}

class FakeVisibilityDoc extends EventTarget {
  public visibilityState: DocumentVisibilityState = 'visible';
  public hasFocus = (): boolean => true;
}

describe('EmbraceUserSessionManager browser activity', () => {
  let clock: sinon.SinonFakeTimers;
  let target: FakeTarget;
  let manager: EmbraceUserSessionManager;
  let startSpy: sinon.SinonSpy<[options: StartSessionPartOptions], void>;
  let endSpy: sinon.SinonSpy;
  let visibilityDoc: FakeVisibilityDoc;

  // Pulls reasons from the spies in the same order startSessionPartInternal /
  // endSessionPartInternal were invoked.
  const startReasons = (): SessionPartStartReason[] =>
    startSpy.getCalls().map((c) => c.args[0].reason);
  const endReasons = (): SessionPartEndReason[] =>
    endSpy.getCalls().map((c) => (c.args[0] as EndSessionPartOptions).reason);

  beforeEach(() => {
    clock = sinon.useFakeTimers({ now: 0 });
    target = new FakeTarget();
    visibilityDoc = new FakeVisibilityDoc();
    manager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      perf: new MockPerformanceManager(clock),
      storage: setupTestStorage(),
      visibilityDoc,
      target,
      activityThrottleMs: THROTTLE_MS,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    // Browser-activity listeners attach inside setTracerProvider; activity
    // tests need them live, so wire a tracer provider before spying.
    manager.setTracerProvider(new WebTracerProvider());
    startSpy = sinon.spy(manager, 'startSessionPartInternal');
    endSpy = sinon.spy(manager, 'endSessionPartInternal');
  });

  afterEach(() => {
    manager._shutdown();
    clock.restore();
    sinon.restore();
  });

  const fireActivity = (type = 'mousedown') => {
    target.dispatchEvent(new Event(type));
  };

  const fireVisibilityChange = (state: DocumentVisibilityState) => {
    visibilityDoc.visibilityState = state;
    visibilityDoc.dispatchEvent(new Event('visibilitychange'));
  };

  const fireBlur = () => {
    visibilityDoc.hasFocus = () => false;
    target.dispatchEvent(new Event('blur'));
  };

  const fireFocus = () => {
    visibilityDoc.hasFocus = () => true;
    target.dispatchEvent(new Event('focus'));
  };

  // Focus-shifting active-tab unload (URL-bar typing, alt-tab-then-close):
  // blur fires first, then visibilitychange to 'hidden'. The programmatic
  // nav variant fires no blur and is exercised by fireVisibilityChange('hidden')
  // directly. See README for the verified cross-engine ordering.
  const fireFocusShiftingUnload = () => {
    visibilityDoc.hasFocus = () => false;
    target.dispatchEvent(new Event('blur'));
    visibilityDoc.visibilityState = 'hidden';
    visibilityDoc.dispatchEvent(new Event('visibilitychange'));
  };

  // Tab becomes hidden. Covers two real Chrome scenarios that look
  // identical to the SDK: the user switching to another tab, and an
  // already-backgrounded tab unloading. In both cases the SDK only
  // observes visibilitychange-to-'hidden' since pagehide is not listened to.
  const fireTabHidden = () => {
    visibilityDoc.visibilityState = 'hidden';
    visibilityDoc.hasFocus = () => false;
    visibilityDoc.dispatchEvent(new Event('visibilitychange'));
  };

  // BFCache restore per Chrome's page-lifecycle docs (Playwright suppresses
  // BFCache, so this is doc-derived not empirically observed): focus fires
  // first while still 'hidden', then visibilitychange to 'visible' starts
  // the part. The trailing pageshow has no listener.
  const fireBfcacheRestore = () => {
    visibilityDoc.hasFocus = () => true;
    target.dispatchEvent(new Event('focus'));
    visibilityDoc.visibilityState = 'visible';
    visibilityDoc.dispatchEvent(new Event('visibilitychange'));
  };

  it('arms the part-inactivity timer when a part starts', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    clock.tick(FOREGROUND_INACTIVITY_MS - 1);
    expect(endReasons()).to.deep.equal([]);

    clock.tick(1);
    expect(endReasons()).to.deep.equal(['web_foreground_inactivity']);
  });

  it('resets the part-inactivity timer on activity', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    clock.tick(FOREGROUND_INACTIVITY_MS - 1);
    fireActivity();

    clock.tick(FOREGROUND_INACTIVITY_MS - 1);
    expect(endReasons()).to.deep.equal([]);

    clock.tick(1);
    expect(endReasons()).to.deep.equal(['web_foreground_inactivity']);
  });

  it('throttles activity events within the throttle window', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    fireActivity();
    clock.tick(THROTTLE_MS - 1);
    fireActivity();

    clock.tick(FOREGROUND_INACTIVITY_MS - (THROTTLE_MS - 1) - 1);
    expect(endReasons()).to.deep.equal([]);
    clock.tick(1);
    expect(endReasons()).to.deep.equal(['web_foreground_inactivity']);
  });

  it('ends the part with reason web_foreground_inactivity when the part-inactivity window elapses', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    clock.tick(FOREGROUND_INACTIVITY_MS);

    expect(endReasons()).to.deep.equal(['web_foreground_inactivity']);
    // The part end reason is web-prefixed, but the enclosing user session's
    // termination reason stays unprefixed for cross-platform correlation.
    expect(
      (endSpy.lastCall.args[0] as EndSessionPartOptions).userSessionEndReason,
    ).to.equal('inactivity');
    void expect(manager.getSessionPartId()).to.be.null;
  });

  it('starts a new part with reason activity after an inactivity-killed part', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    clock.tick(FOREGROUND_INACTIVITY_MS);
    void expect(manager.getSessionPartId()).to.be.null;

    fireActivity();

    expect(startReasons()).to.deep.equal(['init', 'web_activity']);
    void expect(manager.getSessionPartId()).to.not.be.null;

    clock.tick(FOREGROUND_INACTIVITY_MS);
    expect(endReasons()).to.deep.equal([
      'web_foreground_inactivity',
      'web_foreground_inactivity',
    ]);
  });

  it('starts a part with reason activity when input arrives and no part is active', () => {
    fireActivity();

    expect(startReasons()).to.deep.equal(['web_activity']);
  });

  it('clears the part-inactivity timer when a part ends through another path', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    clock.tick(FOREGROUND_INACTIVITY_MS / 2);
    manager.endSessionPartInternal({
      reason: 'user_session_ended',
      userSessionEndReason: 'manual',
    });

    clock.tick(FOREGROUND_INACTIVITY_MS);
    expect(endReasons()).to.deep.equal(['user_session_ended']);
  });

  it('ends the active part with reason background when the tab hides', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    fireVisibilityChange('hidden');

    expect(endReasons()).to.deep.equal(['web_background']);
    void expect(manager.getSessionPartId()).to.be.null;
  });

  it('is a no-op on visibility hidden when no part is active', () => {
    fireVisibilityChange('hidden');

    expect(endReasons()).to.deep.equal([]);
    expect(startReasons()).to.deep.equal([]);
  });

  it('starts a new part with reason foreground when the tab returns to visible', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    fireVisibilityChange('hidden');
    void expect(manager.getSessionPartId()).to.be.null;

    fireVisibilityChange('visible');

    expect(startReasons()).to.deep.equal(['init', 'web_foreground']);
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('ignores pagehide and pageshow events (no listeners registered)', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    target.dispatchEvent(
      new PageTransitionEvent('pagehide', { persisted: false }),
    );
    target.dispatchEvent(
      new PageTransitionEvent('pagehide', { persisted: true }),
    );
    target.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: false }),
    );
    target.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    );

    expect(endReasons()).to.deep.equal([]);
    expect(startReasons()).to.deep.equal(['init']);
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('ends the active part with reason background when the window loses focus', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    fireBlur();

    expect(endReasons()).to.deep.equal(['web_background']);
    void expect(manager.getSessionPartId()).to.be.null;
  });

  it('starts a new part with reason foreground when focus returns to a visible tab', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    fireBlur();
    void expect(manager.getSessionPartId()).to.be.null;

    fireFocus();

    expect(startReasons()).to.deep.equal(['init', 'web_foreground']);
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('ignores activity events on a visible-but-unfocused tab', () => {
    manager.startSessionPartInternal({ reason: 'init' });
    fireBlur();

    fireActivity();

    // visibilityState='visible' but hasFocus()=false: side-by-side / DevTools-
    // undocked case. No new part should start from activity in the unfocused
    // window.
    expect(startReasons()).to.deep.equal(['init']);
  });

  // The tests below assert the real-Chrome event sequences. Each helper
  // dispatches the events in shipping-browser order with the correct
  // intermediate state transitions, pinning down which listener "wins"
  // in production.

  it('ends the active part exactly once as web_background on a real active-tab unload sequence', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    fireFocusShiftingUnload();

    expect(endReasons()).to.deep.equal(['web_background']);
    expect(endSpy.callCount).to.equal(1);
    void expect(manager.getSessionPartId()).to.be.null;
  });

  it('ends on visibilitychange-to-hidden for an already-backgrounded tab unload', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    fireTabHidden();

    expect(endReasons()).to.deep.equal(['web_background']);
    expect(endSpy.callCount).to.equal(1);
    void expect(manager.getSessionPartId()).to.be.null;
  });

  it('starts the new part exactly once as web_foreground on a real BFCache restore sequence', () => {
    manager.startSessionPartInternal({ reason: 'init' });
    fireTabHidden();
    startSpy.resetHistory();
    endSpy.resetHistory();

    fireBfcacheRestore();

    expect(startReasons()).to.deep.equal(['web_foreground']);
    expect(startSpy.callCount).to.equal(1);
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('nets to one end and one start across a full active-tab unload then BFCache restore round-trip', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    fireFocusShiftingUnload();
    fireBfcacheRestore();

    expect(endReasons()).to.deep.equal(['web_background']);
    expect(startReasons()).to.deep.equal(['init', 'web_foreground']);
    expect(endSpy.callCount).to.equal(1);
    expect(startSpy.callCount).to.equal(2);
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('re-arms the part-inactivity timer when an engagement event fires while already engaged and active', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    clock.tick(FOREGROUND_INACTIVITY_MS - 1);
    // Redundant focus event while the tab is still engaged and the part is
    // still active (no blur/hide in between). This is the
    // browser-quirk path: the engagement handler should re-arm the
    // inactivity timer rather than start a new part.
    target.dispatchEvent(new Event('focus'));

    // The timer was re-armed at this tick, so it now needs another full
    // window before inactivity fires.
    clock.tick(FOREGROUND_INACTIVITY_MS - 1);
    expect(endReasons()).to.deep.equal([]);
    clock.tick(1);
    expect(endReasons()).to.deep.equal(['web_foreground_inactivity']);
    // No additional part starts: still only the initial 'init'.
    expect(startReasons()).to.deep.equal(['init']);
  });

  it('starts a fresh part when an activity event arrives just after the prior part finalized', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    // Inactivity expires; the part finalizes. Then user activity resumes;
    // the next event must start a new part with reason 'web_activity'.
    clock.tick(FOREGROUND_INACTIVITY_MS);
    expect(endReasons()).to.deep.equal(['web_foreground_inactivity']);
    void expect(manager.getSessionPartId()).to.be.null;

    fireActivity();

    expect(startReasons()).to.deep.equal(['init', 'web_activity']);
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('arms the live timer from the foreground value, not the inactivity value', () => {
    const splitManager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      perf: new MockPerformanceManager(clock),
      storage: setupTestStorage(),
      visibilityDoc,
      target,
      activityThrottleMs: THROTTLE_MS,
      dynamicConfigManager: createTestDynamicConfigManager({
        userSessionForegroundInactivityTimeoutSeconds: 60,
        userSessionInactivityTimeoutSeconds: 1800,
      }),
    });
    splitManager.setTracerProvider(new WebTracerProvider());
    const endSpy2 = sinon.spy(splitManager, 'endSessionPartInternal');

    splitManager.startSessionPartInternal({ reason: 'init' });

    // Live timer fires on the 60s foreground value, not the 1800s inactivity value.
    clock.tick(60 * 1000 - 1);
    expect(endSpy2.called).to.equal(false);
    clock.tick(1);
    expect(endSpy2.callCount).to.equal(1);
    const endOptions2 = endSpy2.lastCall.args[0] as EndSessionPartOptions;
    expect(endOptions2.reason).to.equal('web_foreground_inactivity');
    expect(endOptions2.userSessionEndReason).to.equal('inactivity');

    splitManager._shutdown();
  });

  it('removes listeners and clears the timer on shutdown', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    expect(target.listenerCount('keydown')).to.equal(1);
    expect(target.listenerCount('focus')).to.equal(1);
    expect(target.listenerCount('blur')).to.equal(1);

    manager._shutdown();

    expect(target.listenerCount('keydown')).to.equal(0);
    expect(target.listenerCount('mousedown')).to.equal(0);
    expect(target.listenerCount('mousemove')).to.equal(0);
    expect(target.listenerCount('scroll')).to.equal(0);
    expect(target.listenerCount('focus')).to.equal(0);
    expect(target.listenerCount('blur')).to.equal(0);

    // visibilitychange listens on `visibilityDoc`, not `target`. Verify the
    // listener was unsubscribed by dispatching hidden and asserting no end.
    const endCallsBeforeVisibility = endSpy.callCount;
    fireVisibilityChange('hidden');
    expect(endSpy.callCount).to.equal(endCallsBeforeVisibility);

    // The internal part-inactivity timer was cleared on shutdown, so no
    // further endSessionPartInternal({ reason: 'web_foreground_inactivity' }) calls fire.
    const endCallsBefore = endSpy.callCount;
    clock.tick(FOREGROUND_INACTIVITY_MS * 2);
    expect(endSpy.callCount).to.equal(endCallsBefore);
  });

  describe('soft navigation (currententrychange)', () => {
    let navigationTarget: FakeNavigation;
    let softNavManager: EmbraceUserSessionManager;
    let softNavStartSpy: sinon.SinonSpy<
      [options: StartSessionPartOptions],
      void
    >;
    let softNavEndSpy: sinon.SinonSpy;

    const softNavStartReasons = (): SessionPartStartReason[] =>
      softNavStartSpy.getCalls().map((c) => c.args[0].reason);
    const softNavEndReasons = (): SessionPartEndReason[] =>
      softNavEndSpy
        .getCalls()
        .map((c) => (c.args[0] as EndSessionPartOptions).reason);

    const fireCurrentEntryChange = () => {
      navigationTarget.fire('http://previous.example.com/');
    };

    beforeEach(() => {
      navigationTarget = new FakeNavigation();
      softNavManager = new EmbraceUserSessionManager({
        limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
        perf: new MockPerformanceManager(clock),
        storage: setupTestStorage(),
        visibilityDoc,
        target,
        activityThrottleMs: THROTTLE_MS,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
        navigationHost: {
          navigation: navigationTarget as unknown as Navigation,
          location: { href: 'http://current.example.com/' },
        },
      });
      softNavManager.setTracerProvider(new WebTracerProvider());
      softNavStartSpy = sinon.spy(softNavManager, 'startSessionPartInternal');
      softNavEndSpy = sinon.spy(softNavManager, 'endSessionPartInternal');
    });

    afterEach(() => {
      softNavManager._shutdown();
    });

    it('rolls over the part with web_soft_nav reasons when a navigation fires while a part is active', () => {
      softNavManager.startSessionPartInternal({ reason: 'init' });

      fireCurrentEntryChange();

      expect(softNavEndReasons()).to.deep.equal(['web_soft_nav']);
      expect(softNavStartReasons()).to.deep.equal(['init', 'web_soft_nav']);
      void expect(softNavManager.getSessionPartId()).to.not.be.null;
    });

    it('is a no-op when navigating to the same URL', () => {
      softNavManager.startSessionPartInternal({ reason: 'init' });

      navigationTarget.fire('http://current.example.com/');

      expect(softNavEndReasons()).to.deep.equal([]);
      expect(softNavStartReasons()).to.deep.equal(['init']);
    });

    it('is a no-op when a navigation fires with no active part', () => {
      fireCurrentEntryChange();

      expect(softNavEndReasons()).to.deep.equal([]);
      expect(softNavStartReasons()).to.deep.equal([]);
    });

    it('removes the currententrychange listener on shutdown', () => {
      softNavManager.startSessionPartInternal({ reason: 'init' });
      softNavManager._shutdown();
      softNavStartSpy.resetHistory();
      softNavEndSpy.resetHistory();

      fireCurrentEntryChange();

      expect(softNavEndReasons()).to.deep.equal([]);
      expect(softNavStartReasons()).to.deep.equal([]);
    });

    it('handles absent navigation gracefully (old browser)', () => {
      const noNavManager = new EmbraceUserSessionManager({
        limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
        perf: new MockPerformanceManager(clock),
        storage: setupTestStorage(),
        visibilityDoc,
        target,
        activityThrottleMs: THROTTLE_MS,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
        navigationHost: { location: { href: 'http://current.example.com/' } },
      });
      expect(() => {
        noNavManager.setTracerProvider(new WebTracerProvider());
        noNavManager.startSessionPartInternal({ reason: 'init' });
        noNavManager._shutdown();
      }).to.not.throw();
    });
  });
});
