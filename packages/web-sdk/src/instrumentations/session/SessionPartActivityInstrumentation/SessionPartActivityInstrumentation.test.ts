import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type {
  SessionPartEndReason,
  SessionPartManager,
  SessionPartStartReason,
} from '../../../api-sessions/index.ts';
import { session } from '../../../api-sessions/index.ts';
import { SessionPartActivityInstrumentation } from './SessionPartActivityInstrumentation.ts';

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

class FakeSessionPartManager
  implements
    Pick<
      SessionPartManager,
      | 'getSessionPartId'
      | 'startSessionPart'
      | 'endSessionPartInternal'
      | 'addSessionPartStartedListener'
      | 'addSessionPartEndedListener'
    >
{
  public startReasons: Array<SessionPartStartReason | undefined> = [];
  public endReasons: Array<SessionPartEndReason> = [];
  private _activeId: string | null = null;
  private _counter = 0;
  private readonly _startedListeners = new Set<() => void>();
  private readonly _endedListeners = new Set<() => void>();

  public getSessionPartId(): string | null {
    return this._activeId;
  }

  public startSessionPart(reason?: SessionPartStartReason): void {
    this.startReasons.push(reason);
    this._counter += 1;
    this._activeId = `part-${this._counter.toString()}`;
    for (const l of this._startedListeners) {
      l();
    }
  }

  public endSessionPartInternal(reason: SessionPartEndReason): void {
    if (this._activeId === null) {
      return;
    }
    this.endReasons.push(reason);
    this._activeId = null;
    for (const l of this._endedListeners) {
      l();
    }
  }

  public addSessionPartStartedListener(listener: () => void): () => void {
    this._startedListeners.add(listener);
    return () => {
      this._startedListeners.delete(listener);
    };
  }

  public addSessionPartEndedListener(listener: () => void): () => void {
    this._endedListeners.add(listener);
    return () => {
      this._endedListeners.delete(listener);
    };
  }

  public asSessionPartManager(): SessionPartManager {
    return this as unknown as SessionPartManager;
  }

  public startedListenerCount(): number {
    return this._startedListeners.size;
  }

  public endedListenerCount(): number {
    return this._endedListeners.size;
  }
}

describe('SessionPartActivityInstrumentation', () => {
  let clock: sinon.SinonFakeTimers;
  let target: FakeTarget;
  let partManager: FakeSessionPartManager;
  let visibilityDoc: {
    visibilityState: DocumentVisibilityState;
    hasFocus: () => boolean;
  };

  beforeEach(() => {
    clock = sinon.useFakeTimers({ now: 0 });
    target = new FakeTarget();
    partManager = new FakeSessionPartManager();
    visibilityDoc = { visibilityState: 'visible', hasFocus: () => true };
    session.setGlobalManagers(partManager.asSessionPartManager());
  });

  afterEach(() => {
    clock.restore();
  });

  const createInstrumentation = () =>
    new SessionPartActivityInstrumentation({
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
    target.dispatchEvent(new Event('visibilitychange'));
  };

  const firePageHide = () => {
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

    partManager.startSessionPart('init');

    clock.tick(PART_INACTIVITY_MS - 1);
    expect(partManager.endReasons).to.deep.equal([]);

    clock.tick(1);
    expect(partManager.endReasons).to.deep.equal(['inactivity']);

    instr.disable();
  });

  it('resets the part-inactivity timer on activity', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    clock.tick(PART_INACTIVITY_MS - 1);
    fireActivity();

    clock.tick(PART_INACTIVITY_MS - 1);
    expect(partManager.endReasons).to.deep.equal([]);

    clock.tick(1);
    expect(partManager.endReasons).to.deep.equal(['inactivity']);

    instr.disable();
  });

  it('throttles activity events within the throttle window', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    fireActivity();
    clock.tick(THROTTLE_MS - 1);
    fireActivity();

    clock.tick(PART_INACTIVITY_MS - (THROTTLE_MS - 1) - 1);
    expect(partManager.endReasons).to.deep.equal([]);
    clock.tick(1);
    expect(partManager.endReasons).to.deep.equal(['inactivity']);

    instr.disable();
  });

  it('ends the part with reason inactivity when the part-inactivity window elapses', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    clock.tick(PART_INACTIVITY_MS);

    expect(partManager.endReasons).to.deep.equal(['inactivity']);
    expect(partManager.getSessionPartId()).to.equal(null);

    instr.disable();
  });

  it('starts a new part with reason activity after an inactivity-killed part', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    clock.tick(PART_INACTIVITY_MS);
    expect(partManager.getSessionPartId()).to.equal(null);

    fireActivity();

    expect(partManager.startReasons).to.deep.equal(['init', 'activity']);
    expect(partManager.getSessionPartId()).to.not.equal(null);

    clock.tick(PART_INACTIVITY_MS);
    expect(partManager.endReasons).to.deep.equal(['inactivity', 'inactivity']);

    instr.disable();
  });

  it('starts a part with reason activity when input arrives and no part is active', () => {
    const instr = createInstrumentation();
    fireActivity();

    expect(partManager.startReasons).to.deep.equal(['activity']);

    instr.disable();
  });

  it('clears the part-inactivity timer when a part ends through another path', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    clock.tick(PART_INACTIVITY_MS / 2);
    partManager.endSessionPartInternal('user_session_ended');

    clock.tick(PART_INACTIVITY_MS);
    expect(partManager.endReasons).to.deep.equal(['user_session_ended']);

    instr.disable();
  });

  it('arms the part-inactivity timer immediately if a part is already active at construction', () => {
    partManager.startSessionPart('init');

    const instr = createInstrumentation();

    clock.tick(PART_INACTIVITY_MS);
    expect(partManager.endReasons).to.deep.equal(['inactivity']);

    instr.disable();
  });

  it('ends the active part with reason visibility_change when the tab hides', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    fireVisibilityChange('hidden');

    expect(partManager.endReasons).to.deep.equal(['visibility_change']);
    expect(partManager.getSessionPartId()).to.equal(null);

    instr.disable();
  });

  it('is a no-op on visibility hidden when no part is active', () => {
    const instr = createInstrumentation();

    fireVisibilityChange('hidden');

    expect(partManager.endReasons).to.deep.equal([]);
    expect(partManager.startReasons).to.deep.equal([]);

    instr.disable();
  });

  it('starts a new part with reason visibility_change when the tab returns to visible', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    fireVisibilityChange('hidden');
    expect(partManager.getSessionPartId()).to.equal(null);

    fireVisibilityChange('visible');

    expect(partManager.startReasons).to.deep.equal([
      'init',
      'visibility_change',
    ]);
    expect(partManager.getSessionPartId()).to.not.equal(null);

    instr.disable();
  });

  it('ends the active part with reason visibility_change on pagehide', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    firePageHide();

    expect(partManager.endReasons).to.deep.equal(['visibility_change']);
    expect(partManager.getSessionPartId()).to.equal(null);

    instr.disable();
  });

  it('is a no-op on pagehide when no part is active', () => {
    const instr = createInstrumentation();

    firePageHide();

    expect(partManager.endReasons).to.deep.equal([]);
    expect(partManager.startReasons).to.deep.equal([]);

    instr.disable();
  });

  it('ends the active part with reason visibility_change when the window loses focus', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    fireBlur();

    expect(partManager.endReasons).to.deep.equal(['visibility_change']);
    expect(partManager.getSessionPartId()).to.equal(null);

    instr.disable();
  });

  it('starts a new part with reason visibility_change when focus returns to a visible tab', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    fireBlur();
    expect(partManager.getSessionPartId()).to.equal(null);

    fireFocus();

    expect(partManager.startReasons).to.deep.equal([
      'init',
      'visibility_change',
    ]);
    expect(partManager.getSessionPartId()).to.not.equal(null);

    instr.disable();
  });

  it('ignores activity events on a visible-but-unfocused tab', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');
    fireBlur();

    fireActivity();

    // visibilityState='visible' but hasFocus()=false: side-by-side / DevTools-
    // undocked case. No new part should start from activity in the unfocused
    // window.
    expect(partManager.startReasons).to.deep.equal(['init']);

    instr.disable();
  });

  it('starts a new part with reason visibility_change on pageshow (BFCache restore)', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    // BFCache restore path: pagehide ended the prior part, then pageshow
    // signals the canonical restore. No part is active when pageshow fires.
    firePageHide();
    expect(partManager.getSessionPartId()).to.equal(null);

    firePageShow();

    expect(partManager.startReasons).to.deep.equal([
      'init',
      'visibility_change',
    ]);
    expect(partManager.getSessionPartId()).to.not.equal(null);

    instr.disable();
  });

  it('removes listeners and clears the timer on disable', () => {
    const instr = createInstrumentation();
    partManager.startSessionPart('init');

    expect(target.listenerCount('keydown')).to.equal(1);
    expect(target.listenerCount('visibilitychange')).to.equal(1);
    expect(target.listenerCount('pagehide')).to.equal(1);
    expect(target.listenerCount('pageshow')).to.equal(1);
    expect(partManager.startedListenerCount()).to.equal(1);
    expect(partManager.endedListenerCount()).to.equal(1);

    instr.disable();

    expect(target.listenerCount('keydown')).to.equal(0);
    expect(target.listenerCount('mousedown')).to.equal(0);
    expect(target.listenerCount('mousemove')).to.equal(0);
    expect(target.listenerCount('scroll')).to.equal(0);
    expect(target.listenerCount('visibilitychange')).to.equal(0);
    expect(target.listenerCount('pagehide')).to.equal(0);
    expect(target.listenerCount('pageshow')).to.equal(0);
    expect(partManager.startedListenerCount()).to.equal(0);
    expect(partManager.endedListenerCount()).to.equal(0);

    clock.tick(PART_INACTIVITY_MS * 2);
    expect(partManager.endReasons).to.deep.equal([]);
  });
});
