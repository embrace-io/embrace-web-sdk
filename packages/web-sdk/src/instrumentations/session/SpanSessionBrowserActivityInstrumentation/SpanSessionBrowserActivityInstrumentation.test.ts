import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  InMemoryDiagLogger,
  InMemoryStorage,
  MockPerformanceManager,
} from '../../../../tests/utils/index.ts';
import type {
  SessionPartEndReason,
  SessionPartStartReason,
} from '../../../api-sessions/index.ts';
import { session } from '../../../api-sessions/index.ts';
import { EmbraceSpanSessionManager } from '../../../managers/EmbraceSpanSessionManager/EmbraceSpanSessionManager.ts';
import type { SpanSessionManagerInternal } from '../../../managers/EmbraceSpanSessionManager/index.ts';
import { EmbraceStorage } from '../../../utils/EmbraceStorage/EmbraceStorage.ts';
import { SpanSessionBrowserActivityInstrumentation } from './SpanSessionBrowserActivityInstrumentation.ts';

chai.use(sinonChai);
const { expect } = chai;

const PART_INACTIVITY_MS = 30 * 60 * 1000;
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

describe('SpanSessionBrowserActivityInstrumentation', () => {
  let clock: sinon.SinonFakeTimers;
  let target: FakeTarget;
  let spanSessionManager: SpanSessionManagerInternal;
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
    spanSessionManager = new EmbraceSpanSessionManager({
      perf: new MockPerformanceManager(clock),
      storage: new EmbraceStorage(
        new InMemoryStorage(),
        new InMemoryDiagLogger(),
      ),
      visibilityDoc,
    });
    startSpy = sinon.spy(spanSessionManager, 'startSessionPartInternal');
    endSpy = sinon.spy(spanSessionManager, 'endSessionPartInternal');
    session.setGlobalSessionManager(spanSessionManager);
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  const createInstrumentation = () =>
    new SpanSessionBrowserActivityInstrumentation({
      target,
      visibilityDoc,
      partInactivityTimeoutMs: PART_INACTIVITY_MS,
      throttleMs: THROTTLE_MS,
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
    const instr = createInstrumentation();

    spanSessionManager.startSessionPartInternal('init');

    clock.tick(PART_INACTIVITY_MS - 1);
    expect(endReasons()).to.deep.equal([]);

    clock.tick(1);
    expect(endReasons()).to.deep.equal(['inactivity']);

    instr.disable();
  });

  it('resets the part-inactivity timer on activity', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    clock.tick(PART_INACTIVITY_MS - 1);
    fireActivity();

    clock.tick(PART_INACTIVITY_MS - 1);
    expect(endReasons()).to.deep.equal([]);

    clock.tick(1);
    expect(endReasons()).to.deep.equal(['inactivity']);

    instr.disable();
  });

  it('throttles activity events within the throttle window', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    fireActivity();
    clock.tick(THROTTLE_MS - 1);
    fireActivity();

    clock.tick(PART_INACTIVITY_MS - (THROTTLE_MS - 1) - 1);
    expect(endReasons()).to.deep.equal([]);
    clock.tick(1);
    expect(endReasons()).to.deep.equal(['inactivity']);

    instr.disable();
  });

  it('ends the part with reason inactivity when the part-inactivity window elapses', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    clock.tick(PART_INACTIVITY_MS);

    expect(endReasons()).to.deep.equal(['inactivity']);
    void expect(spanSessionManager.getSessionPartId()).to.be.null;

    instr.disable();
  });

  it('starts a new part with reason activity after an inactivity-killed part', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    clock.tick(PART_INACTIVITY_MS);
    void expect(spanSessionManager.getSessionPartId()).to.be.null;

    fireActivity();

    expect(startReasons()).to.deep.equal(['init', 'activity']);
    void expect(spanSessionManager.getSessionPartId()).to.not.be.null;

    clock.tick(PART_INACTIVITY_MS);
    expect(endReasons()).to.deep.equal(['inactivity', 'inactivity']);

    instr.disable();
  });

  it('starts a part with reason activity when input arrives and no part is active', () => {
    const instr = createInstrumentation();
    fireActivity();

    expect(startReasons()).to.deep.equal(['activity']);

    instr.disable();
  });

  it('clears the part-inactivity timer when a part ends through another path', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    clock.tick(PART_INACTIVITY_MS / 2);
    spanSessionManager.endSessionPartInternal('user_session_ended', 'manual');

    clock.tick(PART_INACTIVITY_MS);
    expect(endReasons()).to.deep.equal(['user_session_ended']);

    instr.disable();
  });

  it('arms the part-inactivity timer immediately if a part is already active at construction', () => {
    spanSessionManager.startSessionPartInternal('init');

    const instr = createInstrumentation();

    clock.tick(PART_INACTIVITY_MS);
    expect(endReasons()).to.deep.equal(['inactivity']);

    instr.disable();
  });

  it('ends the active part with reason visibility_change when the tab hides', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    fireVisibilityChange('hidden');

    expect(endReasons()).to.deep.equal(['visibility_change']);
    void expect(spanSessionManager.getSessionPartId()).to.be.null;

    instr.disable();
  });

  it('is a no-op on visibility hidden when no part is active', () => {
    const instr = createInstrumentation();

    fireVisibilityChange('hidden');

    expect(endReasons()).to.deep.equal([]);
    expect(startReasons()).to.deep.equal([]);

    instr.disable();
  });

  it('starts a new part with reason visibility_change when the tab returns to visible', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    fireVisibilityChange('hidden');
    void expect(spanSessionManager.getSessionPartId()).to.be.null;

    fireVisibilityChange('visible');

    expect(startReasons()).to.deep.equal(['init', 'visibility_change']);
    void expect(spanSessionManager.getSessionPartId()).to.not.be.null;

    instr.disable();
  });

  it('ends the active part with reason visibility_change on pagehide', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    firePageHide();

    expect(endReasons()).to.deep.equal(['visibility_change']);
    void expect(spanSessionManager.getSessionPartId()).to.be.null;

    instr.disable();
  });

  it('is a no-op on pagehide when no part is active', () => {
    const instr = createInstrumentation();

    firePageHide();

    expect(endReasons()).to.deep.equal([]);
    expect(startReasons()).to.deep.equal([]);

    instr.disable();
  });

  it('ends the active part with reason visibility_change when the window loses focus', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    fireBlur();

    expect(endReasons()).to.deep.equal(['visibility_change']);
    void expect(spanSessionManager.getSessionPartId()).to.be.null;

    instr.disable();
  });

  it('starts a new part with reason visibility_change when focus returns to a visible tab', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    fireBlur();
    void expect(spanSessionManager.getSessionPartId()).to.be.null;

    fireFocus();

    expect(startReasons()).to.deep.equal(['init', 'visibility_change']);
    void expect(spanSessionManager.getSessionPartId()).to.not.be.null;

    instr.disable();
  });

  it('ignores activity events on a visible-but-unfocused tab', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');
    fireBlur();

    fireActivity();

    // visibilityState='visible' but hasFocus()=false: side-by-side / DevTools-
    // undocked case. No new part should start from activity in the unfocused
    // window.
    expect(startReasons()).to.deep.equal(['init']);

    instr.disable();
  });

  it('starts a new part with reason visibility_change on pageshow (BFCache restore)', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    // BFCache restore path: pagehide ended the prior part, then pageshow
    // signals the canonical restore. No part is active when pageshow fires.
    firePageHide();
    void expect(spanSessionManager.getSessionPartId()).to.be.null;

    // Document is restored visible on BFCache restore.
    visibilityDoc.visibilityState = 'visible';
    firePageShow();

    expect(startReasons()).to.deep.equal(['init', 'visibility_change']);
    void expect(spanSessionManager.getSessionPartId()).to.not.be.null;

    instr.disable();
  });

  it('does not start a part on pageshow (BFCache restore) when the tab is disengaged at restore', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    // Tab freezes while disengaged: pagehide ends the prior part, then by
    // the time pageshow fires, the document has restored hidden (the user
    // restored a backgrounded tab without bringing it to focus).
    firePageHide();
    visibilityDoc.visibilityState = 'hidden';
    firePageShow();

    // No new part. Only 'init' is in the start log.
    expect(startReasons()).to.deep.equal(['init']);
    void expect(spanSessionManager.getSessionPartId()).to.be.null;

    instr.disable();
  });

  it('starts a fresh part when an activity event arrives just after the prior part finalized', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    // Inactivity expires; the part finalizes. Then user activity resumes;
    // the next event must start a new part with reason 'activity'.
    clock.tick(PART_INACTIVITY_MS);
    expect(endReasons()).to.deep.equal(['inactivity']);
    void expect(spanSessionManager.getSessionPartId()).to.be.null;

    fireActivity();

    expect(startReasons()).to.deep.equal(['init', 'activity']);
    void expect(spanSessionManager.getSessionPartId()).to.not.be.null;

    instr.disable();
  });

  it('removes listeners and clears the timer on disable', () => {
    const instr = createInstrumentation();
    spanSessionManager.startSessionPartInternal('init');

    expect(target.listenerCount('keydown')).to.equal(1);
    expect(target.listenerCount('pagehide')).to.equal(1);
    expect(target.listenerCount('pageshow')).to.equal(1);

    instr.disable();

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

    // The internal part-inactivity timer was cleared on disable, so no
    // further endSessionPartInternal('inactivity') calls fire.
    const endCallsBefore = endSpy.callCount;
    clock.tick(PART_INACTIVITY_MS * 2);
    expect(endSpy.callCount).to.equal(endCallsBefore);
  });
});
