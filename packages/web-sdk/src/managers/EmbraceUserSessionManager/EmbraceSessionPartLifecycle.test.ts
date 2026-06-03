import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  createTestDynamicConfigManager,
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
  MockPerformanceManager,
  setupTestTraceExporter,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../tests/utils/index.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import { KEY_EMB_PAGE_LOAD } from '../../constants/index.ts';
import { NamespacedStorage } from '../../utils/NamespacedStorage/NamespacedStorage.ts';
import type { PerformanceManager } from '../../utils/PerformanceManager/types.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
} from '../EmbraceLimitManager/index.ts';
import { EmbraceExtendedSpan } from '../EmbraceTraceManager/EmbraceExtendedSpan.ts';
import { EmbraceUserSessionManager } from './EmbraceUserSessionManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceUserSessionManager session part lifecycle', () => {
  let manager: EmbraceUserSessionManager;
  let memoryExporter: InMemorySpanExporter;
  let diag: InMemoryDiagLogger;
  let inMemoryStorage: InMemoryStorage;
  let storage: NamespacedStorage;
  let limitManager: EmbraceLimitManager;
  let perf: PerformanceManager;
  let clock: sinon.SinonFakeTimers;

  before(() => {
    memoryExporter = setupTestTraceExporter();
    inMemoryStorage = new InMemoryStorage();
  });

  beforeEach(() => {
    memoryExporter.reset();
    // Clear storage before constructing the manager: the constructor now
    // reads the permanent-properties blob, so leftover state from a
    // previous test would otherwise leak into _permanentProperties.
    inMemoryStorage.clear();
    diag = new InMemoryDiagLogger();
    storage = new NamespacedStorage({ storage: inMemoryStorage, diag });
    clock = sinon.useFakeTimers({ now: 0 });
    perf = new MockPerformanceManager(clock);
    limitManager = new EmbraceLimitManager({
      diag,
      ...DEFAULT_LIMITS,
      maxAllowed: {
        ...DEFAULT_LIMITS.maxAllowed,
        breadcrumb: 3,
        session_property: 4,
      },
      maxLength: {
        ...DEFAULT_LIMITS.maxLength,
        breadcrumb: 50,
        session_property_key: 20,
        session_property_value: 40,
      },
    });

    manager = new EmbraceUserSessionManager({
      diag,
      storage,
      limitManager,
      perf,
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
  });

  afterEach(() => {
    clock.restore();
  });

  it('should initialize a EmbraceUserSessionManager', () => {
    expect(manager).to.be.instanceOf(EmbraceUserSessionManager);
  });

  it('should start a session part', () => {
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
    manager.startSessionPartInternal('init');
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('should end the session part', () => {
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
    manager.startSessionPartInternal('init');
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    const sessionPartId = manager.getSessionPartId();
    void expect(sessionPartId).to.not.be.null;
    manager.endSessionPartInternal('web_background');
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.session_part_end_reason',
      'web_background',
    );
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.session_part_id',
      sessionPartId,
    );
  });

  it('should ignore startSessionPartInternal calls when a part is already active', () => {
    manager.startSessionPartInternal('init');
    const sessionPartId = manager.getSessionPartId();
    void expect(sessionPartId).to.not.be.null;

    manager.startSessionPartInternal('web_activity');

    // Active part is unchanged, no part spans were finalized.
    expect(manager.getSessionPartId()).to.equal(sessionPartId);
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    expect(diag.getWarnLogs()).to.have.lengthOf(1);
    expect(diag.getWarnLogs()[0]).to.equal(
      'startSessionPartInternal called while a part is active (reason: web_activity); ignoring',
    );
  });

  it('should not end a session if there is no active session', () => {
    manager.endSessionPartInternal('web_background');
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(0);
    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'trying to end a session part, but there is no session part in progress. This is a no-op.',
    );
  });

  it('should not fail if trying to add breadcrumb to non active session', () => {
    manager.addBreadcrumb('some breadcrumb');

    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'trying to add breadcrumb, but there is no session part in progress. This is a no-op.',
    );
  });

  it('should add breadcrumb to session part span', () => {
    manager.startSessionPartInternal('init');
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    void expect(manager.getSessionPartId()).to.not.be.null;

    manager.addBreadcrumb('some breadcrumb');
    manager.endSessionPartInternal('web_background');

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];
    expect(sessionPartSpan.events).to.have.lengthOf(1);

    expect(sessionPartSpan.events[0].name).to.equal('emb-breadcrumb');
    expect(sessionPartSpan.events[0].attributes).to.have.property(
      'message',
      'some breadcrumb',
    );
  });

  it('should queue properties added before any part is active and apply them to the next part', () => {
    // Properties are user-session-scoped, not part-scoped. addProperty
    // eager-initializes user-session state if none exists yet, so a write
    // made before the first part lands in the state row and gets stamped
    // on the part span when it starts.
    manager.addProperty('queued-property', 'queued-value');
    manager.startSessionPartInternal('init');
    manager.endSessionPartInternal('web_background');

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes).to.have.property(
      'emb.properties.queued-property',
      'queued-value',
    );
  });

  it('should add properties to session part span', () => {
    manager.startSessionPartInternal('init');

    manager.addProperty('custom-property-1', 'custom value1');
    manager.addProperty('custom-property-2', 'custom value2');
    manager.endSessionPartInternal('web_background');

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];

    expect(sessionPartSpan.attributes).to.have.property(
      'emb.properties.custom-property-1',
      'custom value1',
    );
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.properties.custom-property-2',
      'custom value2',
    );
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.session_part_end_reason',
      'web_background',
    );
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.type',
      'ux.session_part',
    );
  });

  it('should start a foreground session when the document is visible', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
      hasFocus: () => true,
    };
    const localManager = new EmbraceUserSessionManager({
      visibilityDoc,
      limitManager,
      perf,
      storage,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    localManager.startSessionPartInternal('init');
    localManager.endSessionPartInternal('web_background');

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.state',
      'foreground',
    );
  });

  // Engagement gate is visibilityState === 'visible' && hasFocus(). Any
  // other combination must block startSessionPartInternal. Visible+hasFocus
  // is the happy path tested above.
  const disengagedCases: Array<{
    name: string;
    visibilityState: DocumentVisibilityState;
    hasFocus: boolean;
  }> = [
    { name: 'hidden', visibilityState: 'hidden', hasFocus: false },
    {
      name: 'visible but unfocused',
      visibilityState: 'visible',
      hasFocus: false,
    },
  ];

  for (const { name, visibilityState, hasFocus } of disengagedCases) {
    it(`should skip starting a session part when the document is ${name}`, () => {
      const visibilityDoc: VisibilityStateDocument = {
        visibilityState,
        hasFocus: () => hasFocus,
      };
      const localManager = new EmbraceUserSessionManager({
        visibilityDoc,
        limitManager,
        perf,
        storage,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      localManager.startSessionPartInternal('init');
      void expect(localManager.getSessionPartId()).to.be.null;
      void expect(localManager.getSessionPartSpan()).to.be.null;

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(0);
    });
  }

  it('should call the session start listener when starting a session', () => {
    const listener = sinon.stub();
    const localManager = new EmbraceUserSessionManager({
      limitManager,
      perf,
      storage,
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    const removeListener = localManager.addSessionPartStartedListener(listener);

    void expect(listener.calledOnce).to.be.false;

    localManager.startSessionPartInternal('init');

    void expect(listener.calledOnce).to.be.true;

    removeListener();
    localManager.startSessionPartInternal('init');

    void expect(listener.calledOnce).to.be.true;
  });

  it('should call the session ended listener when ending a session', () => {
    let listenerSessionPartId: string | null = null;
    const localManager = new EmbraceUserSessionManager({
      limitManager,
      perf,
      storage,
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });

    const listener = () => {
      listenerSessionPartId = localManager.getSessionPartId();
    };
    const removeListener = localManager.addSessionPartEndedListener(listener);

    void expect(listenerSessionPartId).to.be.null;

    localManager.startSessionPartInternal('init');
    let sessionPartId = localManager.getSessionPartId();
    localManager.endSessionPartInternal('web_background');

    void expect(listenerSessionPartId).to.be.eq(sessionPartId);

    removeListener();
    localManager.startSessionPartInternal('init');
    sessionPartId = localManager.getSessionPartId();
    localManager.endSessionPartInternal('web_background');

    void expect(listenerSessionPartId).not.to.be.eq(sessionPartId);
  });

  it('should limit the amount of breadcrumbs per session', () => {
    manager.startSessionPartInternal('init');

    for (let i = 0; i < 10; i++) {
      manager.addBreadcrumb('this is a breadcrumb');
    }

    manager.endSessionPartInternal('web_background');
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];
    expect(sessionPartSpan.events).to.have.lengthOf(3);

    for (let i = 0; i < 3; i++) {
      expect(sessionPartSpan.events[i].name).to.equal('emb-breadcrumb');
      expect(sessionPartSpan.events[i].attributes).to.have.property(
        'message',
        'this is a breadcrumb',
      );
    }

    expect(
      sessionPartSpan.attributes['emb.app.applied_limit.breadcrumb.drop.count'],
    ).to.be.equal(7);

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.have.lengthOf(7);
    for (let i = 0; i < warningLogs.length; i++) {
      expect(warningLogs[i]).to.equal(
        'disallowing breadcrumb because the maximum number of 3 has already been reached for this session',
      );
    }

    // A new session should reset the limit
    memoryExporter.reset();
    manager.startSessionPartInternal('init');
    manager.addBreadcrumb('this is a breadcrumb');
    manager.endSessionPartInternal('web_background');
    const nextSessionFinishedSpans = memoryExporter.getFinishedSpans();
    expect(nextSessionFinishedSpans).to.have.lengthOf(1);
    const nextSessionPartSpan = nextSessionFinishedSpans[0];
    expect(nextSessionPartSpan.events).to.have.lengthOf(1);
    expect(nextSessionPartSpan.events[0].name).to.equal('emb-breadcrumb');
    expect(nextSessionPartSpan.events[0].attributes).to.have.property(
      'message',
      'this is a breadcrumb',
    );
  });

  it('should truncate breadcrumb names', () => {
    manager.startSessionPartInternal('init');

    manager.addBreadcrumb('this is a breadcrumb');
    manager.addBreadcrumb(
      'this is a breadcrumb which has a name longer than the allowed maximum length',
    );

    manager.endSessionPartInternal('web_background');
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];
    expect(sessionPartSpan.events).to.have.lengthOf(2);
    expect(sessionPartSpan.events[0].name).to.equal('emb-breadcrumb');
    expect(sessionPartSpan.events[0].attributes).to.have.property(
      'message',
      'this is a breadcrumb',
    );
    expect(sessionPartSpan.events[1].name).to.equal('emb-breadcrumb');
    expect(sessionPartSpan.events[1].attributes).to.have.property(
      'message',
      'this is a breadcrumb which has a name longer than ',
    );

    expect(
      sessionPartSpan.attributes[
        'emb.app.applied_limit.breadcrumb.truncate_string.count'
      ],
    ).to.be.equal(1);

    expect(diag.getWarnLogs()).to.have.lengthOf(1);
    expect(diag.getWarnLogs()[0]).to.equal(
      'truncating breadcrumb because it is longer than 50 characters: "this is a breadcrumb which has a name longer than the allowed maximum length"',
    );
  });

  it('should limit the amount of session properties per session', () => {
    manager.startSessionPartInternal('init');

    for (let i = 0; i < 10; i++) {
      manager.addProperty(`property${i.toString()}`, i.toString());
    }

    manager.endSessionPartInternal('web_background');
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];

    for (let i = 0; i < 10; i++) {
      const prop = `emb.properties.property${i.toString()}`;
      if (i < 4) {
        void expect(sessionPartSpan.attributes).to.have.property(
          prop,
          i.toString(),
        );
      } else {
        void expect(sessionPartSpan.attributes).not.to.have.property(prop);
      }
    }

    expect(
      sessionPartSpan.attributes[
        'emb.app.applied_limit.session_property.drop.count'
      ],
    ).to.be.equal(6);

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.have.lengthOf(6);
    for (let i = 0; i < warningLogs.length; i++) {
      expect(warningLogs[i]).to.equal(
        'disallowing session_property because the maximum number of 4 has already been reached for this session',
      );
    }

    // A new session should reset the limit
    memoryExporter.reset();
    manager.startSessionPartInternal('init');
    manager.addProperty('my-new-prop', 'new');
    manager.endSessionPartInternal('web_background');
    const nextSessionFinishedSpans = memoryExporter.getFinishedSpans();
    expect(nextSessionFinishedSpans).to.have.lengthOf(1);
    const nextSessionPartSpan = nextSessionFinishedSpans[0];
    expect(nextSessionPartSpan.attributes).to.have.property(
      'emb.properties.my-new-prop',
      'new',
    );
  });

  it('should truncate session property keys and values', () => {
    manager.startSessionPartInternal('init');

    manager.addProperty('key1', '1');
    manager.addProperty(
      'session-property-with-long-key',
      'session property long value with extra information',
    );

    manager.endSessionPartInternal('web_background');
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];

    expect(sessionPartSpan.attributes).to.have.property(
      'emb.properties.session-property-wit',
      'session property long value with extra i',
    );

    expect(
      sessionPartSpan.attributes[
        'emb.app.applied_limit.session_property_key.truncate_string.count'
      ],
    ).to.be.equal(1);

    expect(
      sessionPartSpan.attributes[
        'emb.app.applied_limit.session_property_value.truncate_string.count'
      ],
    ).to.be.equal(1);

    expect(diag.getWarnLogs()).to.have.lengthOf(2);
    expect(diag.getWarnLogs()[0]).to.equal(
      'truncating session_property_key because it is longer than 20 characters: "session-property-with-long-key"',
    );
    expect(diag.getWarnLogs()[1]).to.equal(
      'truncating session_property_value because it is longer than 40 characters: "session property long value with extra information"',
    );
  });

  it('should store permanent properties in the permanent-properties blob with bare keys', () => {
    const propertyKey = 'permanent-key';
    const value = 'permanent-value';

    manager.startSessionPartInternal('init');
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });

    // No top-level emb.properties.* entry: the prefix only exists on the
    // wire (the manager stamps it onto the part span at end time).
    void expect(inMemoryStorage.getItem(`emb.properties.${propertyKey}`)).to.be
      .null;

    const blob = (key: string): Record<string, string> => {
      const raw = inMemoryStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    };
    expect(blob('embrace_permanent_properties')).to.have.property(
      propertyKey,
      value,
    );

    manager.endSessionPartInternal('web_background');

    // Survives across user-session boundaries.
    expect(blob('embrace_permanent_properties')).to.have.property(
      propertyKey,
      value,
    );
  });

  it('should persist user-session-scoped properties inside the user-session state blob with bare keys', () => {
    const propertyKey = 'session-only-key';
    const value = 'session-only-value';
    manager.startSessionPartInternal('init');
    manager.addProperty(propertyKey, value);

    // Not a top-level entry: that path is reserved for permanent properties,
    // and even there the value lives inside a blob, never as its own key.
    void expect(inMemoryStorage.getItem(`emb.properties.${propertyKey}`)).to.be
      .null;

    // Stored inside the user-session state blob so other tabs sharing the
    // same user session see it on their next part start.
    const stateRaw = inMemoryStorage.getItem('embrace_user_session_state');
    void expect(stateRaw).to.not.be.null;
    const state = JSON.parse(stateRaw as string) as {
      userSessionProperties: Record<string, string>;
    };
    expect(state.userSessionProperties).to.have.property(propertyKey, value);
  });

  it('should make user-session-scoped properties visible to a second manager sharing storage', () => {
    // Simulates a second tab on the same user session: the second manager
    // reads the persisted state and stamps the user-session-scoped property
    // on its first part span.
    const propertyKey = 'cart-size';
    const attributeKey = `emb.properties.${propertyKey}`;
    const value = '3';

    manager.startSessionPartInternal('init');
    manager.addProperty(propertyKey, value);
    manager.endSessionPartInternal('web_background');

    const secondManager = new EmbraceUserSessionManager({
      diag,
      storage,
      limitManager,
      perf,
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    secondManager.startSessionPartInternal('init');
    secondManager.endSessionPartInternal('web_background');

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(2);
    expect(finishedSpans[1].attributes).to.have.property(attributeKey, value);
  });

  it('should leave the persisted user-session-scoped entry intact when a permanent flip fails to write', () => {
    // Regression: an addProperty(key, val, {lifespan: 'permanent'}) call that
    // fails to persist must not strip a pre-existing user-session-scoped
    // entry for the same key, otherwise other tabs lose visibility into a
    // value the SDK has already promised them.
    const backing = new InMemoryStorage();
    let permanentWriteShouldFail = false;
    const partiallyFailingStorage: Storage = {
      get length() {
        return backing.length;
      },
      clear: () => backing.clear(),
      getItem: (k) => backing.getItem(k),
      key: (i) => backing.key(i),
      removeItem: (k) => backing.removeItem(k),
      setItem: (k, v) => {
        if (permanentWriteShouldFail && k === 'embrace_permanent_properties') {
          throw new Error('quota');
        }
        backing.setItem(k, v);
      },
    };
    const flipManager = new EmbraceUserSessionManager({
      diag,
      limitManager,
      perf,
      storage: new NamespacedStorage({
        storage: partiallyFailingStorage,
        diag,
      }),
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    flipManager.startSessionPartInternal('init');
    flipManager.addProperty('cart', '3');

    permanentWriteShouldFail = true;
    flipManager.addProperty('cart', '4', { lifespan: 'permanent' });

    // No permanent blob entry was written (write failed).
    void expect(backing.getItem('embrace_permanent_properties')).to.be.null;
    // The user-session-scoped persisted entry is still '3' so other tabs
    // continue to see the previously-visible value.
    const stateRaw = backing.getItem('embrace_user_session_state');
    void expect(stateRaw).to.not.be.null;
    const state = JSON.parse(stateRaw as string) as {
      userSessionProperties: Record<string, string>;
    };
    expect(state.userSessionProperties).to.have.property('cart', '3');
  });

  it('should reject the property write when storage is unavailable for a user-session-scoped property', () => {
    const failingManager = new EmbraceUserSessionManager({
      diag,
      limitManager,
      perf,
      storage: new NamespacedStorage({
        storage: new FailingStorage(),
        diag,
      }),
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    failingManager.startSessionPartInternal('init');

    expect(() => failingManager.addProperty('flag', 'on')).to.not.throw();

    // The property is rejected entirely: a value that can't persist would
    // diverge from what other tabs (and the next page load) see, which is
    // worse than no property at all.
    expect(failingManager.getSessionPartProperties()).to.not.have.property(
      'flag',
    );
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('writes disabled');
    expect(diag.getWarnLogs().some((l) => l.includes('rejecting'))).to.equal(
      true,
    );
  });

  it('should clear permanent properties from the blob when removed', () => {
    const propertyKey = 'permanent-key';
    const value = 'permanent-value';

    const blob = (): Record<string, string> => {
      const raw = inMemoryStorage.getItem('embrace_permanent_properties');
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    };

    manager.startSessionPartInternal('init');
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    expect(blob()).to.have.property(propertyKey, value);
    manager.endSessionPartInternal('web_background');

    manager.startSessionPartInternal('init');
    manager.removeProperty(propertyKey);
    void expect(blob()[propertyKey]).to.be.undefined;
    manager.endSessionPartInternal('web_background');

    void expect(blob()[propertyKey]).to.be.undefined;
  });

  it('should carry both permanent and non-permanent properties across part transitions within the same user session', () => {
    // Non-permanent properties survive part end and apply to the next part:
    // they are persisted inside the user-session state blob alongside the
    // rest of the user-session state, while permanent properties live in
    // the permanent-properties blob. Without a user-session boundary,
    // ending the part is a part transition only, so both kinds carry over.
    const sessionOnlyPropertyKey = 'session-only-key';
    const sessionOnlyValue = 'session-only-value';
    const permanentPropertyKey = 'permanent-key';
    const permanentValue = 'permanent-value';

    manager.startSessionPartInternal('init');
    manager.addProperty(sessionOnlyPropertyKey, sessionOnlyValue);
    manager.addProperty(permanentPropertyKey, permanentValue, {
      lifespan: 'permanent',
    });
    manager.endSessionPartInternal('web_background');

    manager.startSessionPartInternal('init');
    expect(manager.getSessionPartProperties()).to.have.property(
      sessionOnlyPropertyKey,
      sessionOnlyValue,
    );
    expect(manager.getSessionPartProperties()).to.have.property(
      permanentPropertyKey,
      permanentValue,
    );
  });

  it('should clear non-permanent properties at user-session end while preserving permanent ones', () => {
    // endUserSession calls endSessionPartInternal with reason
    // 'user_session_ended', which clears the in-memory user-session
    // property map; the new user session begins with a fresh state blob,
    // so persisted user-session-scoped properties are gone too. Permanent
    // properties (kept in their own blob) survive the user-session
    // boundary unchanged.
    const sessionOnlyPropertyKey = 'session-only-key';
    const permanentPropertyKey = 'permanent-key';

    manager.startSessionPartInternal('init');
    manager.addProperty(sessionOnlyPropertyKey, 'session-only-value');
    manager.addProperty(permanentPropertyKey, 'permanent-value', {
      lifespan: 'permanent',
    });

    manager.endUserSession();

    void expect(manager.getSessionPartProperties()[sessionOnlyPropertyKey]).to
      .be.undefined;
    expect(manager.getSessionPartProperties()).to.have.property(
      permanentPropertyKey,
      'permanent-value',
    );
  });

  it('should not persist removed permanent properties into new sessions', () => {
    const propertyKey = 'permanent-key';
    const value = 'permanent-value';

    manager.startSessionPartInternal('init');
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    manager.endSessionPartInternal('web_background');

    manager.startSessionPartInternal('init');
    manager.removeProperty(propertyKey);
    manager.endSessionPartInternal('web_background');

    manager.startSessionPartInternal('init');
    expect(manager.getSessionPartProperties()).to.not.have.property(
      propertyKey,
      value,
    );
  });

  it('should handle removing permanent properties that have long keys', () => {
    const propertyKey = 'permanent-key-that-is-longer-than-the-character-limit';
    const truncatedKey = 'permanent-key-that-i';
    const value = 'permanent-value';

    manager.startSessionPartInternal('init');
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    manager.endSessionPartInternal('web_background');

    manager.startSessionPartInternal('init');
    expect(manager.getSessionPartProperties()).to.have.property(
      truncatedKey,
      value,
    );
    expect(manager.getSessionPartProperties()).to.not.have.property(
      propertyKey,
      value,
    );
    manager.removeProperty(propertyKey);
    manager.endSessionPartInternal('web_background');

    manager.startSessionPartInternal('init');
    expect(manager.getSessionPartProperties()).to.not.have.property(
      truncatedKey,
      value,
    );
    expect(manager.getSessionPartProperties()).to.not.have.property(
      propertyKey,
      value,
    );
  });

  it('should still emit a session part span when storage is failing', () => {
    const failingManager = new EmbraceUserSessionManager({
      diag,
      limitManager,
      perf,
      storage: new NamespacedStorage({
        storage: new FailingStorage(),
        diag,
      }),
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });

    failingManager.startSessionPartInternal('init');
    failingManager.endSessionPartInternal('web_background');

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);

    // NamespacedStorage emits a single error on the first failed write and warns
    // on each failed read; the manager keeps recording in-memory.
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('writes disabled');
  });

  it('should reject the property write when storage is unavailable for a permanent property', () => {
    const failingManager = new EmbraceUserSessionManager({
      diag,
      limitManager,
      perf,
      storage: new NamespacedStorage({
        storage: new FailingStorage(),
        diag,
      }),
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    failingManager.startSessionPartInternal('init');

    expect(() =>
      failingManager.addProperty('flag', 'on', { lifespan: 'permanent' }),
    ).to.not.throw();

    // The property is rejected entirely so callers don't see a value that
    // won't persist to other tabs or survive a reload.
    expect(failingManager.getSessionPartProperties()).to.not.have.property(
      'flag',
    );
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('writes disabled');
    expect(diag.getWarnLogs().some((l) => l.includes('rejecting'))).to.equal(
      true,
    );
  });

  it('should not throw when storage write fails while removing the last permanent property', () => {
    // Storage that succeeds on getItem (so the manager loads an existing
    // permanent property at construction) but throws on the removeItem
    // that fires when the blob becomes empty. Inline construction; no
    // shared helper covers this asymmetric failure mode.
    const backing = new InMemoryStorage();
    backing.setItem(
      'embrace_permanent_properties',
      JSON.stringify({ flag: 'on' }),
    );
    const flakyStorage: Storage = {
      get length() {
        return backing.length;
      },
      key: (i) => backing.key(i),
      getItem: (k) => backing.getItem(k),
      setItem: (k, v) => backing.setItem(k, v),
      removeItem: () => {
        throw new Error('quota exhausted on removeItem');
      },
      clear: () => backing.clear(),
    };
    const flakyManager = new EmbraceUserSessionManager({
      diag,
      limitManager,
      perf,
      storage: new NamespacedStorage({ storage: flakyStorage, diag }),
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    flakyManager.startSessionPartInternal('init');

    expect(() => flakyManager.removeProperty('flag')).to.not.throw();
    expect(
      diag.getWarnLogs().some((m) => m.includes('failed to remove')),
    ).to.equal(true);
  });

  it('should be a silent no-op when removeProperty is called for a key that was never set', () => {
    manager.startSessionPartInternal('init');
    expect(() => manager.removeProperty('never-set')).to.not.throw();
    // No storage write happens, no warning is logged.
    expect(
      diag.getWarnLogs().some((l) => l.includes('removing permanent')),
    ).to.equal(false);
  });

  it('should allow setting a different trace provider', () => {
    const secondMemoryExporter = new InMemorySpanExporter();
    const tracerProvider = new WebTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(secondMemoryExporter)],
    });

    manager.setTracerProvider(tracerProvider);
    manager.startSessionPartInternal('init');
    manager.endSessionPartInternal('web_background');

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    expect(secondMemoryExporter.getFinishedSpans()).to.have.lengthOf(1);
  });

  describe('user session attribute integration', () => {
    it('should attach user session attributes to the session part span', () => {
      const exporter = new InMemorySpanExporter();
      const tracerProvider = new WebTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      });
      manager.setTracerProvider(tracerProvider);

      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_background');

      const finishedSpans = exporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      const sessionPartSpan = finishedSpans[0];
      expect(sessionPartSpan.attributes)
        .to.have.property('emb.user_session_id')
        .that.is.a('string');
      expect(sessionPartSpan.attributes).to.have.property(
        'emb.user_session_number',
        1,
      );
      expect(sessionPartSpan.attributes).to.have.property(
        'emb.user_session_part_index',
        1,
      );
    });

    it('should restart parts after endUserSession via the rollover flow', () => {
      const localManager = new EmbraceUserSessionManager({
        diag,
        storage,
        limitManager,
        perf,
        dynamicConfigManager: createTestDynamicConfigManager({
          userSessionMaxDurationSeconds: 3600,
        }),
        visibilityDoc: window.document,
      });

      localManager.startSessionPartInternal('init');
      const firstPartId = localManager.getSessionPartId();

      localManager.endUserSession();

      expect(localManager.getSessionPartId()).to.not.equal(firstPartId);
      expect(localManager.getSessionPartId()).to.not.equal(null);
    });

    it('should mark the session part as final when user session terminates', () => {
      manager.startSessionPartInternal('init');
      manager.endUserSession();

      const finishedSpans = memoryExporter.getFinishedSpans();
      // endUserSession ends the dying part and starts a rollover part;
      // the test assertion only checks the dying part's attributes.
      expect(finishedSpans.length).to.be.at.least(1);
      const endedSpan = finishedSpans[0];
      expect(endedSpan.attributes).to.have.property(
        'emb.is_final_session_part',
        1,
      );
      expect(endedSpan.attributes).to.have.property(
        'emb.user_session_termination_reason',
        'manual',
      );
    });

    it('should not write a continuation snapshot to storage during endUserSession', () => {
      // Regression: termination used to flow through an inactivity-deadline
      // write that races the state-clear and emits a stray storage event.
      // The merged manager skips the deadline write when reason is
      // 'user_session_ended', so termination produces only a clear followed
      // by the new session's first write.
      const stateOps: Array<'set' | 'remove'> = [];
      const spyBacking = new InMemoryStorage();
      const originalSet = spyBacking.setItem.bind(spyBacking);
      const originalRemove = spyBacking.removeItem.bind(spyBacking);
      spyBacking.setItem = (key, value) => {
        if (key === 'embrace_user_session_state') {
          stateOps.push('set');
        }
        originalSet(key, value);
      };
      spyBacking.removeItem = (key) => {
        if (key === 'embrace_user_session_state') {
          stateOps.push('remove');
        }
        originalRemove(key);
      };

      const localManager = new EmbraceUserSessionManager({
        diag,
        storage: new NamespacedStorage({ storage: spyBacking, diag }),
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });

      localManager.startSessionPartInternal('init');
      stateOps.length = 0;

      localManager.endUserSession();

      // Exactly two storage ops: remove (clear the dying session), then set
      // (start the rollover session). No intermediate set with a stale
      // continuation snapshot.
      expect(stateOps).to.deep.equal(['remove', 'set']);
    });

    it('should mark part as final when max duration timer fires during active part', () => {
      const localManager = new EmbraceUserSessionManager({
        diag,
        storage,
        limitManager,
        perf,
        dynamicConfigManager: createTestDynamicConfigManager({
          userSessionMaxDurationSeconds: 3600,
          userSessionInactivityTimeoutSeconds: 3600,
          userSessionForegroundInactivityTimeoutSeconds: 3600,
        }),
        visibilityDoc: window.document,
      });

      localManager.startSessionPartInternal('init');

      clock.tick(3601 * 1000);

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans.length).to.be.at.least(1);
      const endedSpan = finishedSpans[0];
      expect(endedSpan.attributes).to.have.property(
        'emb.is_final_session_part',
        1,
      );
      expect(endedSpan.attributes).to.have.property(
        'emb.user_session_termination_reason',
        'max_duration_reached',
      );
    });

    it('should defer the rollover part start until the tab becomes engaged when max duration fires while hidden', () => {
      // When max-duration fires while the tab is not engaged, the old user
      // session is ended and storage is cleared, but the rollover part's start
      // is no-op because startSessionPartInternal refuses to begin a part
      // while the tab is hidden / unfocused. The next engagement event
      // (handled by the manager's browser-activity listeners in production) is
      // what actually starts the new part.
      const visibilityState: {
        current: 'visible' | 'hidden';
        focused: boolean;
      } = { current: 'visible', focused: true };
      const visibilityDoc: VisibilityStateDocument = {
        get visibilityState() {
          return visibilityState.current;
        },
        hasFocus: () => visibilityState.focused,
      };

      const localManager = new EmbraceUserSessionManager({
        diag,
        perf,
        storage,
        limitManager,
        visibilityDoc,
        // Match inactivity to max so only the max-duration timer fires
        // first (timers registered earlier fire first when set to the same
        // delay; max-duration is armed in _ensureUserSessionState before
        // the inactivity timer is armed by startSessionPartInternal).
        dynamicConfigManager: createTestDynamicConfigManager({
          userSessionMaxDurationSeconds: 3600,
          userSessionInactivityTimeoutSeconds: 3600,
          userSessionForegroundInactivityTimeoutSeconds: 3600,
        }),
      });

      localManager.startSessionPartInternal('init');
      const firstUserSessionId = localManager.getUserSessionId();
      const firstPartId = localManager.getSessionPartId();
      void expect(firstPartId).to.not.be.null;

      // Tab is no longer engaged before the max-duration boundary.
      visibilityState.current = 'hidden';
      visibilityState.focused = false;

      clock.tick(3601 * 1000);

      // Max-duration ended the old part and cleared the user session, but
      // the rollover startSessionPartInternal skipped because the tab is hidden.
      void expect(localManager.getSessionPartSpan()).to.be.null;
      void expect(localManager.getSessionPartId()).to.be.null;
      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.is_final_session_part',
        1,
      );
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.user_session_termination_reason',
        'max_duration_reached',
      );

      // Tab becomes engaged again. The manager's _onEngagementChange would
      // call startSessionPartInternal('web_foreground') in production;
      // simulate that here. A new user session is created.
      visibilityState.current = 'visible';
      visibilityState.focused = true;
      localManager.startSessionPartInternal('web_foreground');

      void expect(localManager.getSessionPartId()).to.not.be.null;
      expect(localManager.getSessionPartId()).to.not.equal(firstPartId);
      expect(localManager.getUserSessionId()).to.not.equal(firstUserSessionId);
    });

    it('should detect inactivity expiry lazily on the next part start and roll a new user session', () => {
      // Inactivity expiry is detected only when a new foreground part begins:
      // no JS timer runs, so the previous part's span is already exported
      // (without is_final) by the time we notice the gap.
      const localManager = new EmbraceUserSessionManager({
        diag,
        perf,
        storage,
        limitManager,
        dynamicConfigManager: createTestDynamicConfigManager({
          userSessionInactivityTimeoutSeconds: 60,
        }),
        visibilityDoc: window.document,
      });

      localManager.startSessionPartInternal('init');
      const firstUserSessionId = localManager.getUserSessionId();
      localManager.endSessionPartInternal('web_background');

      clock.tick(61 * 1000);

      localManager.startSessionPartInternal('init');
      const secondUserSessionId = localManager.getUserSessionId();

      expect(secondUserSessionId).to.not.equal(firstUserSessionId);
    });

    it('should keep the same user session id across consecutive parts within inactivity timeout', () => {
      manager.startSessionPartInternal('init');
      const firstUserSessionId = manager.getUserSessionId();
      manager.endSessionPartInternal('web_background');

      manager.startSessionPartInternal('init');
      const secondUserSessionId = manager.getUserSessionId();

      expect(secondUserSessionId).to.equal(firstUserSessionId);
    });

    it('should stamp emb.user_session_previous_id on a part span created during a user-session rollover', () => {
      const exporter = new InMemorySpanExporter();
      const tracerProvider = new WebTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      });
      const localManager = new EmbraceUserSessionManager({
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      localManager.setTracerProvider(tracerProvider);

      localManager.startSessionPartInternal('init');
      const firstUserSessionId = localManager.getUserSessionId();
      void expect(firstUserSessionId).to.not.be.null;

      // Triggers endUserSession -> rollover -> a fresh user session and a
      // brand new part span. The new part span must carry the previous user
      // session's id on emb.user_session_previous_id.
      localManager.endUserSession();
      localManager.endSessionPartInternal('web_background');

      const finishedSpans = exporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      const rolloverPartSpan = finishedSpans[1];
      expect(rolloverPartSpan.attributes).to.have.property(
        'emb.user_session_previous_id',
        firstUserSessionId,
      );
    });
  });

  describe('emb.session_part_start_reason', () => {
    it('should default to "init" on the part span when no reason is passed', () => {
      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_background');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_start_reason',
        'init',
      );
    });

    it('should stamp "activity" on the part span when started with that reason', () => {
      manager.startSessionPartInternal('web_activity');
      manager.endSessionPartInternal('web_background');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_start_reason',
        'web_activity',
      );
    });

    it('should stamp "user_session_rollover" on the part span started by user-session rollover', () => {
      manager.startSessionPartInternal('init');
      // Triggers the rollover path inside endUserSession, which restarts a
      // part with reason 'user_session_rollover'.
      manager.endUserSession();
      manager.endSessionPartInternal('web_background');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_start_reason',
        'init',
      );
      expect(finishedSpans[1].attributes).to.have.property(
        'emb.session_part_start_reason',
        'user_session_rollover',
      );
    });

    it('should stamp "user_session_rollover" on the part span started by max-duration timer', () => {
      const localManager = new EmbraceUserSessionManager({
        diag,
        storage,
        limitManager,
        perf,
        dynamicConfigManager: createTestDynamicConfigManager({
          userSessionMaxDurationSeconds: 3600,
          userSessionInactivityTimeoutSeconds: 3600,
          userSessionForegroundInactivityTimeoutSeconds: 3600,
        }),
        visibilityDoc: window.document,
      });

      localManager.startSessionPartInternal('init');

      clock.tick(3601 * 1000);

      localManager.endSessionPartInternal('web_background');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_start_reason',
        'init',
      );
      expect(finishedSpans[1].attributes).to.have.property(
        'emb.session_part_start_reason',
        'user_session_rollover',
      );
    });
  });

  describe('emb.session_part_end_reason', () => {
    it('should stamp "background" when the part ends on visibility hidden', () => {
      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_background');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_end_reason',
        'web_background',
      );
    });

    it('should stamp "web_foreground_inactivity" when the inactivity timer ends the part', () => {
      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_foreground_inactivity');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_end_reason',
        'web_foreground_inactivity',
      );
    });

    it('should stamp "user_session_ended" when the user-session manager ends the part on rollover', () => {
      manager.startSessionPartInternal('init');
      manager.endUserSession();
      manager.endSessionPartInternal('web_background');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_end_reason',
        'user_session_ended',
      );
      expect(finishedSpans[1].attributes).to.have.property(
        'emb.session_part_end_reason',
        'web_background',
      );
    });
  });

  describe('emb.session_part_number', () => {
    it('emits a 1-indexed monotonic counter on the part span, persisted across visits', () => {
      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_background');
      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_background');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_number',
        1,
      );
      expect(finishedSpans[1].attributes).to.have.property(
        'emb.session_part_number',
        2,
      );
    });
  });

  describe('continuation inactivity handling', () => {
    it('should clear the persisted inactivity deadline when a part continues an active user session', () => {
      const localManager = new EmbraceUserSessionManager({
        diag,
        perf,
        storage,
        limitManager,
        dynamicConfigManager: createTestDynamicConfigManager({
          userSessionInactivityTimeoutSeconds: 60,
        }),
        visibilityDoc: window.document,
      });

      const readDeadline = (): number | null => {
        const raw = inMemoryStorage.getItem('embrace_user_session_state');
        if (!raw) return null;
        return (JSON.parse(raw) as { inactivityDeadlineTs: number | null })
          .inactivityDeadlineTs;
      };

      localManager.startSessionPartInternal('init');
      localManager.endSessionPartInternal('web_background');

      // End-of-part writes an inactivity deadline onto the state row.
      const deadlineAfterEnd = readDeadline();
      void expect(deadlineAfterEnd).to.not.be.null;
      expect(deadlineAfterEnd).to.be.a('number');

      clock.tick(1000);

      // A continuing part (still within the inactivity window) must clear
      // the deadline so a future part-start doesn't read a stale value.
      localManager.startSessionPartInternal('init');

      void expect(readDeadline()).to.be.null;
    });
  });

  describe('span finalization error handling', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should still call span.end() and export the span when setAttributes throws on part end', () => {
      // The end-attribute write must be isolated from `span.end()` so a
      // throw on the attribute path does not block the export.
      const setAttributesStub = sandbox
        .stub(EmbraceExtendedSpan.prototype, 'setAttributes')
        .throws(new Error('poisoned attribute value'));

      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_background');

      // The span must still be ended and exported, despite the throw.
      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(1);
      expect(setAttributesStub).to.have.been.called;

      // The error must be observably logged so on-call can correlate.
      expect(
        diag
          .getWarnLogs()
          .some((m) =>
            m.includes('Error setting end attributes on session part span'),
          ),
      ).to.equal(true);

      // The part-side state must still be rotated (the existing finally
      // contract).
      void expect(manager.getSessionPartSpan()).to.be.null;
      void expect(manager.getSessionPartId()).to.be.null;
    });

    it('should rotate part state and warn (not throw) when end attribute construction throws during part end', () => {
      // A misbehaving span attribute store can throw on setAttributes. The
      // throw must be caught, logged, and the finally must still reset the
      // part state so the manager isn't left holding a doomed span.
      sandbox
        .stub(EmbraceExtendedSpan.prototype, 'end')
        .throws(new Error('span-end exploded'));

      manager.startSessionPartInternal('init');
      void expect(manager.getSessionPartSpan()).to.not.be.null;

      expect(() =>
        manager.endSessionPartInternal('web_background'),
      ).to.not.throw();

      void expect(manager.getSessionPartSpan()).to.be.null;
      void expect(manager.getSessionPartId()).to.be.null;
      expect(
        diag
          .getWarnLogs()
          .some((m) => m.includes('Error ending session part span')),
      ).to.equal(true);
    });
  });

  describe('emb.cold_start', () => {
    it('should stamp true on the first part and false on subsequent parts from the same manager', () => {
      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_background');
      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_background');
      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_background');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(3);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.cold_start',
        true,
      );
      expect(finishedSpans[1].attributes).to.have.property(
        'emb.cold_start',
        false,
      );
      expect(finishedSpans[2].attributes).to.have.property(
        'emb.cold_start',
        false,
      );
    });

    it('should stamp true again on the first part from a new manager instance sharing storage', () => {
      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_background');

      const secondManager = new EmbraceUserSessionManager({
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      secondManager.startSessionPartInternal('init');
      secondManager.endSessionPartInternal('web_background');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.cold_start',
        true,
      );
      expect(finishedSpans[1].attributes).to.have.property(
        'emb.cold_start',
        true,
      );
    });
  });

  describe('emb.page_load attribute', () => {
    const makeDoc = (
      readyState: DocumentReadyState,
    ): VisibilityStateDocument => ({
      visibilityState: 'visible',
      hasFocus: () => true,
      readyState,
    });

    it('should set emb.page_load = true when readyState is complete at part end', () => {
      const localManager = new EmbraceUserSessionManager({
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: makeDoc('complete'),
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      localManager.startSessionPartInternal('init');
      localManager.endSessionPartInternal('web_background');

      const [span] = memoryExporter.getFinishedSpans();
      expect(span.attributes).to.have.property(KEY_EMB_PAGE_LOAD, true);
    });

    it('should set emb.page_load = false when readyState is not complete at part end', () => {
      const localManager = new EmbraceUserSessionManager({
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: makeDoc('loading'),
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      localManager.startSessionPartInternal('init');
      localManager.endSessionPartInternal('web_background');

      const [span] = memoryExporter.getFinishedSpans();
      expect(span.attributes).to.have.property(KEY_EMB_PAGE_LOAD, false);
    });

    it('should not set emb.page_load on non-cold-start parts', () => {
      const localManager = new EmbraceUserSessionManager({
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: makeDoc('loading'),
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      localManager.startSessionPartInternal('init');
      localManager.endSessionPartInternal('web_background');
      localManager.startSessionPartInternal('web_foreground');
      localManager.endSessionPartInternal('web_background');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      expect(finishedSpans[1].attributes).to.not.have.property(
        KEY_EMB_PAGE_LOAD,
      );
    });
  });
});
