import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  MockPerformanceManager,
  setupTestStorage,
} from '../../../tests/utils/index.ts';
import type {
  SessionPartEndReason,
  SessionPartStartReason,
} from '../../api-sessions/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
} from '../EmbraceLimitManager/index.ts';
import { EmbraceSpanSessionManager } from './EmbraceSpanSessionManager.ts';

chai.use(sinonChai);
const { expect } = chai;

const SESSION_PART_INACTIVITY_MS = 30 * 60 * 1000;
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

class FakeVisibilityDoc extends EventTarget {
  public visibilityState: DocumentVisibilityState = 'visible';
  public hasFocus = (): boolean => true;
}

describe('EmbraceSpanSessionManager browser activity', () => {
  let clock: sinon.SinonFakeTimers;
  let target: FakeTarget;
  let manager: EmbraceSpanSessionManager;
  let startSpy: sinon.SinonSpy<[reason: SessionPartStartReason], void>;
  let endSpy: sinon.SinonSpy;
  let visibilityDoc: FakeVisibilityDoc;

  // Pulls reasons from the spies in the same order startSessionPartInternal /
  // endSessionPartInternal were invoked.
  const startReasons = (): SessionPartStartReason[] =>
    startSpy.getCalls().map((c) => c.args[0]);
  const endReasons = (): SessionPartEndReason[] =>
    endSpy.getCalls().map((c) => c.args[0] as SessionPartEndReason);

  beforeEach(() => {
    clock = sinon.useFakeTimers({ now: 0 });
    target = new FakeTarget();
    visibilityDoc = new FakeVisibilityDoc();
    manager = new EmbraceSpanSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      perf: new MockPerformanceManager(clock),
      storage: setupTestStorage(),
      visibilityDoc,
      target,
      activityThrottleMs: THROTTLE_MS,
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

  // Per the Page Lifecycle spec, visibilityState is already 'hidden' by the
  // time pagehide fires (visibilitychange to 'hidden' fires first), so the
  // helper mirrors that ordering.
  const firePageHide = () => {
    visibilityDoc.visibilityState = 'hidden';
    target.dispatchEvent(new Event('pagehide'));
  };

  const firePageShow = () => {
    target.dispatchEvent(new Event('pageshow'));
  };

  const fireBlur = () => {
    visibilityDoc.hasFocus = () => false;
    target.dispatchEvent(new Event('blur'));
  };

  const fireFocus = () => {
    visibilityDoc.hasFocus = () => true;
    target.dispatchEvent(new Event('focus'));
  };

  it('arms the part-inactivity timer when a part starts', () => {
    manager.startSessionPartInternal('init');

    clock.tick(SESSION_PART_INACTIVITY_MS - 1);
    expect(endReasons()).to.deep.equal([]);

    clock.tick(1);
    expect(endReasons()).to.deep.equal(['inactivity']);
  });

  it('resets the part-inactivity timer on activity', () => {
    manager.startSessionPartInternal('init');

    clock.tick(SESSION_PART_INACTIVITY_MS - 1);
    fireActivity();

    clock.tick(SESSION_PART_INACTIVITY_MS - 1);
    expect(endReasons()).to.deep.equal([]);

    clock.tick(1);
    expect(endReasons()).to.deep.equal(['inactivity']);
  });

  it('throttles activity events within the throttle window', () => {
    manager.startSessionPartInternal('init');

    fireActivity();
    clock.tick(THROTTLE_MS - 1);
    fireActivity();

    clock.tick(SESSION_PART_INACTIVITY_MS - (THROTTLE_MS - 1) - 1);
    expect(endReasons()).to.deep.equal([]);
    clock.tick(1);
    expect(endReasons()).to.deep.equal(['inactivity']);
  });

  it('ends the part with reason inactivity when the part-inactivity window elapses', () => {
    manager.startSessionPartInternal('init');

    clock.tick(SESSION_PART_INACTIVITY_MS);

    expect(endReasons()).to.deep.equal(['inactivity']);
    void expect(manager.getSessionPartId()).to.be.null;
  });

  it('starts a new part with reason activity after an inactivity-killed part', () => {
    manager.startSessionPartInternal('init');

    clock.tick(SESSION_PART_INACTIVITY_MS);
    void expect(manager.getSessionPartId()).to.be.null;

    fireActivity();

    expect(startReasons()).to.deep.equal(['init', 'web_activity']);
    void expect(manager.getSessionPartId()).to.not.be.null;

    clock.tick(SESSION_PART_INACTIVITY_MS);
    expect(endReasons()).to.deep.equal(['inactivity', 'inactivity']);
  });

  it('starts a part with reason activity when input arrives and no part is active', () => {
    fireActivity();

    expect(startReasons()).to.deep.equal(['web_activity']);
  });

  it('clears the part-inactivity timer when a part ends through another path', () => {
    manager.startSessionPartInternal('init');

    clock.tick(SESSION_PART_INACTIVITY_MS / 2);
    manager.endSessionPartInternal('user_session_ended', 'manual');

    clock.tick(SESSION_PART_INACTIVITY_MS);
    expect(endReasons()).to.deep.equal(['user_session_ended']);
  });

  it('ends the active part with reason background when the tab hides', () => {
    manager.startSessionPartInternal('init');

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
    manager.startSessionPartInternal('init');

    fireVisibilityChange('hidden');
    void expect(manager.getSessionPartId()).to.be.null;

    fireVisibilityChange('visible');

    expect(startReasons()).to.deep.equal(['init', 'web_foreground']);
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('ends the active part with reason background on pagehide', () => {
    manager.startSessionPartInternal('init');

    firePageHide();

    expect(endReasons()).to.deep.equal(['web_background']);
    void expect(manager.getSessionPartId()).to.be.null;
  });

  it('is a no-op on pagehide when no part is active', () => {
    firePageHide();

    expect(endReasons()).to.deep.equal([]);
    expect(startReasons()).to.deep.equal([]);
  });

  it('ends the active part with reason background when the window loses focus', () => {
    manager.startSessionPartInternal('init');

    fireBlur();

    expect(endReasons()).to.deep.equal(['web_background']);
    void expect(manager.getSessionPartId()).to.be.null;
  });

  it('starts a new part with reason foreground when focus returns to a visible tab', () => {
    manager.startSessionPartInternal('init');

    fireBlur();
    void expect(manager.getSessionPartId()).to.be.null;

    fireFocus();

    expect(startReasons()).to.deep.equal(['init', 'web_foreground']);
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('ignores activity events on a visible-but-unfocused tab', () => {
    manager.startSessionPartInternal('init');
    fireBlur();

    fireActivity();

    // visibilityState='visible' but hasFocus()=false: side-by-side / DevTools-
    // undocked case. No new part should start from activity in the unfocused
    // window.
    expect(startReasons()).to.deep.equal(['init']);
  });

  it('starts a new part with reason foreground on pageshow (BFCache restore)', () => {
    manager.startSessionPartInternal('init');

    // BFCache restore path: pagehide ended the prior part, then pageshow
    // signals the canonical restore. No part is active when pageshow fires.
    firePageHide();
    void expect(manager.getSessionPartId()).to.be.null;

    // Document is restored visible on BFCache restore.
    visibilityDoc.visibilityState = 'visible';
    firePageShow();

    expect(startReasons()).to.deep.equal(['init', 'web_foreground']);
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('does not start a part on pageshow (BFCache restore) when the tab is disengaged at restore', () => {
    manager.startSessionPartInternal('init');

    // Tab freezes while disengaged: pagehide ends the prior part, then by
    // the time pageshow fires, the document has restored hidden (the user
    // restored a backgrounded tab without bringing it to focus).
    firePageHide();
    visibilityDoc.visibilityState = 'hidden';
    firePageShow();

    // No new part. Only 'init' is in the start log.
    expect(startReasons()).to.deep.equal(['init']);
    void expect(manager.getSessionPartId()).to.be.null;
  });

  it('re-arms the part-inactivity timer when an engagement event fires while already engaged and active', () => {
    manager.startSessionPartInternal('init');

    clock.tick(SESSION_PART_INACTIVITY_MS - 1);
    // Redundant focus event while the tab is still engaged and the part is
    // still active (no blur/hide in between). This is the
    // browser-quirk path: the engagement handler should re-arm the
    // inactivity timer rather than start a new part.
    target.dispatchEvent(new Event('focus'));

    // The timer was re-armed at this tick, so it now needs another full
    // window before inactivity fires.
    clock.tick(SESSION_PART_INACTIVITY_MS - 1);
    expect(endReasons()).to.deep.equal([]);
    clock.tick(1);
    expect(endReasons()).to.deep.equal(['inactivity']);
    // No additional part starts: still only the initial 'init'.
    expect(startReasons()).to.deep.equal(['init']);
  });

  it('starts a fresh part when an activity event arrives just after the prior part finalized', () => {
    manager.startSessionPartInternal('init');

    // Inactivity expires; the part finalizes. Then user activity resumes;
    // the next event must start a new part with reason 'web_activity'.
    clock.tick(SESSION_PART_INACTIVITY_MS);
    expect(endReasons()).to.deep.equal(['inactivity']);
    void expect(manager.getSessionPartId()).to.be.null;

    fireActivity();

    expect(startReasons()).to.deep.equal(['init', 'web_activity']);
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('removes listeners and clears the timer on shutdown', () => {
    manager.startSessionPartInternal('init');

    expect(target.listenerCount('keydown')).to.equal(1);
    expect(target.listenerCount('pagehide')).to.equal(1);
    expect(target.listenerCount('pageshow')).to.equal(1);

    manager._shutdown();

    expect(target.listenerCount('keydown')).to.equal(0);
    expect(target.listenerCount('mousedown')).to.equal(0);
    expect(target.listenerCount('mousemove')).to.equal(0);
    expect(target.listenerCount('scroll')).to.equal(0);
    expect(target.listenerCount('pagehide')).to.equal(0);
    expect(target.listenerCount('pageshow')).to.equal(0);

    // visibilitychange listens on `visibilityDoc`, not `target`. Verify the
    // listener was unsubscribed by dispatching hidden and asserting no end.
    const endCallsBeforeVisibility = endSpy.callCount;
    fireVisibilityChange('hidden');
    expect(endSpy.callCount).to.equal(endCallsBeforeVisibility);

    // The internal part-inactivity timer was cleared on shutdown, so no
    // further endSessionPartInternal('inactivity') calls fire.
    const endCallsBefore = endSpy.callCount;
    clock.tick(SESSION_PART_INACTIVITY_MS * 2);
    expect(endSpy.callCount).to.equal(endCallsBefore);
  });
});
