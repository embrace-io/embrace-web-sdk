import { trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  blockWindowStorage,
  createTestDynamicConfigManager,
  FailingStorage,
  InMemoryDiagLogger,
  InMemorySessionPartCounters,
  InMemoryStorage,
  MockPerformanceManager,
  setupTestLogExporter,
  setupTestTraceExporter,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../tests/utils/index.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import { KEY_EMB_PAGE_LOAD } from '../../constants/index.ts';
import { UserSessionLogRecordProcessor } from '../../processors/index.ts';
import { NamespacedStorage } from '../../utils/NamespacedStorage/NamespacedStorage.ts';
import type { PerformanceManager } from '../../utils/PerformanceManager/types.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
} from '../EmbraceLimitManager/index.ts';
import { EmbraceExtendedSpan } from '../EmbraceTraceManager/EmbraceExtendedSpan.ts';
import { EmbraceUserSessionManager } from './EmbraceUserSessionManager.ts';
import type {
  IncrementSessionPartCountsArgs,
  SessionPartCounters,
  SessionPartCounts,
} from './utils/index.ts';

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
  let counters: InMemorySessionPartCounters;

  before(() => {
    memoryExporter = setupTestTraceExporter();
    inMemoryStorage = new InMemoryStorage();
  });

  beforeEach(() => {
    memoryExporter.reset();
    // The manager reads properties and user-session state from storage, so
    // leftover state from a previous test would otherwise leak in.
    inMemoryStorage.clear();
    diag = new InMemoryDiagLogger();
    storage = new NamespacedStorage({ storage: inMemoryStorage, diag });
    counters = new InMemorySessionPartCounters(storage);
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
      sessionPartCounters: counters,
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
    manager.startSessionPartInternal({ reason: 'init' });
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    void expect(manager.getSessionPartId()).to.not.be.null;
  });

  it('should end the session part', () => {
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
    manager.startSessionPartInternal({ reason: 'init' });
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    const sessionPartId = manager.getSessionPartId();
    void expect(sessionPartId).to.not.be.null;
    manager.endSessionPartInternal({ reason: 'background' });
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.session_part_end_reason',
      'background',
    );
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.session_part_id',
      sessionPartId,
    );
  });

  it('starts the part span on the SDK clock, the one it ends on', () => {
    const timeOrigin = 1_700_000_000_000;
    clock.setSystemTime(timeOrigin);
    const sleepingPerf = new MockPerformanceManager(clock);
    const localManager = new EmbraceUserSessionManager({
      sessionPartCounters: new InMemorySessionPartCounters(),
      diag,
      storage,
      limitManager,
      perf: sleepingPerf,
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    // Date.now() moves ahead of the SDK clock by less than the drift
    // threshold, so the SDK clock is not re-anchored.
    sleepingPerf.sleep(500);

    localManager.startSessionPartInternal({ reason: 'init' });
    localManager.endSessionPartInternal({ reason: 'background' });

    const [span] = memoryExporter.getFinishedSpans();
    expect(hrTimeToMilliseconds(span.startTime)).to.equal(timeOrigin);
    expect(hrTimeToMilliseconds(span.endTime)).to.equal(timeOrigin);
  });

  it('anchors part end and start spans to an explicit boundary timestamp', () => {
    manager.startSessionPartInternal({ reason: 'init' });
    clock.tick(5000);

    const boundaryTimestamp = perf.getNow();
    // Advance the clock past the boundary so the explicit timestamp and
    // "now" diverge. Without this the default now-anchored path would
    // produce the same values and the assertions would pass vacuously.
    clock.tick(250);
    manager.endSessionPartInternal({
      reason: 'background',
      timestamp: boundaryTimestamp,
    });
    manager.startSessionPartInternal({
      reason: 'foreground',
      timestamp: boundaryTimestamp,
    });
    clock.tick(1000);
    manager.endSessionPartInternal({ reason: 'background' });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(2);
    expect(hrTimeToMilliseconds(finishedSpans[0].endTime)).to.equal(
      boundaryTimestamp,
    );
    expect(hrTimeToMilliseconds(finishedSpans[1].startTime)).to.equal(
      boundaryTimestamp,
    );
    // An omitted timestamp still anchors to now.
    expect(hrTimeToMilliseconds(finishedSpans[1].endTime)).to.equal(
      boundaryTimestamp + 1250,
    );
  });

  it('tiles the rolled part spans even when part-end processing takes time', () => {
    manager.startSessionPartInternal({ reason: 'init' });
    clock.tick(5000);
    const boundaryTimestamp = perf.getNow();

    // Simulate unbounded work between the part end and the rollover part
    // start (e.g. slow part-end listeners or a slow SpanProcessor.onEnd
    // pipeline). The rollover anchors both calls to one boundary
    // timestamp, so the delay must not open a gap between the two part
    // spans.
    const removeListener = manager.addSessionPartEndedListener(() => {
      clock.tick(250);
    });
    manager.endUserSession();
    removeListener();
    manager.endSessionPartInternal({ reason: 'background' });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(2);
    // The end stamp is captured upfront even without an anchor; the
    // start-side assertion is the one that checks the shared boundary
    // timestamp.
    expect(hrTimeToMilliseconds(finishedSpans[0].endTime)).to.equal(
      boundaryTimestamp,
    );
    expect(hrTimeToMilliseconds(finishedSpans[1].startTime)).to.equal(
      boundaryTimestamp,
    );
  });

  it('should ignore startSessionPartInternal calls when a part is already active', () => {
    manager.startSessionPartInternal({ reason: 'init' });
    const sessionPartId = manager.getSessionPartId();
    void expect(sessionPartId).to.not.be.null;

    manager.startSessionPartInternal({ reason: 'web_activity' });

    // Active part is unchanged, no part spans were finalized.
    expect(manager.getSessionPartId()).to.equal(sessionPartId);
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    expect(diag.getWarnLogs()).to.have.lengthOf(1);
    expect(diag.getWarnLogs()[0]).to.equal(
      'startSessionPartInternal called while a part is active (reason: web_activity); ignoring',
    );
  });

  it('should not end a session if there is no active session', () => {
    manager.endSessionPartInternal({ reason: 'background' });
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
    manager.startSessionPartInternal({ reason: 'init' });
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    void expect(manager.getSessionPartId()).to.not.be.null;

    manager.addBreadcrumb('some breadcrumb');
    manager.endSessionPartInternal({ reason: 'background' });

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
    // made before the first part is stored in the state row and gets stamped
    // on the part span when it ends.
    manager.addProperty('queued-property', 'queued-value');
    manager.startSessionPartInternal({ reason: 'init' });
    manager.endSessionPartInternal({ reason: 'background' });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes).to.have.property(
      'emb.properties.queued-property',
      'queued-value',
    );
  });

  it('should add properties to session part span', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    manager.addProperty('custom-property-1', 'custom value1');
    manager.addProperty('custom-property-2', 'custom value2');
    manager.endSessionPartInternal({ reason: 'background' });

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
      'background',
    );
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.type',
      'ux.session_part',
    );
  });

  it('should start a foreground session when the document is visible', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
    };
    const localManager = new EmbraceUserSessionManager({
      sessionPartCounters: new InMemorySessionPartCounters(),
      visibilityDoc,
      limitManager,
      perf,
      storage,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    localManager.startSessionPartInternal({ reason: 'init' });
    localManager.endSessionPartInternal({ reason: 'background' });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.state',
      'foreground',
    );
  });

  it('should skip starting a session part when the document is hidden', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'hidden',
    };
    const localManager = new EmbraceUserSessionManager({
      sessionPartCounters: new InMemorySessionPartCounters(),
      visibilityDoc,
      limitManager,
      perf,
      storage,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    localManager.startSessionPartInternal({ reason: 'init' });
    void expect(localManager.getSessionPartId()).to.be.null;
    void expect(localManager.getSessionPartSpan()).to.be.null;

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(0);
  });

  it('should call the session start listener when starting a session', () => {
    const listener = sinon.stub();
    const localManager = new EmbraceUserSessionManager({
      sessionPartCounters: new InMemorySessionPartCounters(),
      limitManager,
      perf,
      storage,
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    const removeListener = localManager.addSessionPartStartedListener(listener);

    void expect(listener.calledOnce).to.be.false;

    localManager.startSessionPartInternal({ reason: 'init' });

    void expect(listener.calledOnce).to.be.true;

    removeListener();
    localManager.startSessionPartInternal({ reason: 'init' });

    void expect(listener.calledOnce).to.be.true;
  });

  it('should call the session ended listener when ending a session', () => {
    let listenerSessionPartId: string | null = null;
    const localManager = new EmbraceUserSessionManager({
      sessionPartCounters: new InMemorySessionPartCounters(),
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

    localManager.startSessionPartInternal({ reason: 'init' });
    let sessionPartId = localManager.getSessionPartId();
    localManager.endSessionPartInternal({ reason: 'background' });

    void expect(listenerSessionPartId).to.be.eq(sessionPartId);

    removeListener();
    localManager.startSessionPartInternal({ reason: 'init' });
    sessionPartId = localManager.getSessionPartId();
    localManager.endSessionPartInternal({ reason: 'background' });

    void expect(listenerSessionPartId).not.to.be.eq(sessionPartId);
  });

  it('should limit the amount of breadcrumbs per session', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    for (let i = 0; i < 10; i++) {
      manager.addBreadcrumb('this is a breadcrumb');
    }

    manager.endSessionPartInternal({ reason: 'background' });
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
    manager.startSessionPartInternal({ reason: 'init' });
    manager.addBreadcrumb('this is a breadcrumb');
    manager.endSessionPartInternal({ reason: 'background' });
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
    manager.startSessionPartInternal({ reason: 'init' });

    manager.addBreadcrumb('this is a breadcrumb');
    manager.addBreadcrumb(
      'this is a breadcrumb which has a name longer than the allowed maximum length',
    );

    manager.endSessionPartInternal({ reason: 'background' });
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
    manager.startSessionPartInternal({ reason: 'init' });

    for (let i = 0; i < 10; i++) {
      manager.addProperty(`property${i.toString()}`, i.toString());
    }

    manager.endSessionPartInternal({ reason: 'background' });
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
    manager.startSessionPartInternal({ reason: 'init' });
    manager.addProperty('my-new-prop', 'new');
    manager.endSessionPartInternal({ reason: 'background' });
    const nextSessionFinishedSpans = memoryExporter.getFinishedSpans();
    expect(nextSessionFinishedSpans).to.have.lengthOf(1);
    const nextSessionPartSpan = nextSessionFinishedSpans[0];
    expect(nextSessionPartSpan.attributes).to.have.property(
      'emb.properties.my-new-prop',
      'new',
    );
  });

  it('should truncate session property keys and values', () => {
    manager.startSessionPartInternal({ reason: 'init' });

    manager.addProperty('key1', '1');
    manager.addProperty(
      'session-property-with-long-key',
      'session property long value with extra information',
    );

    manager.endSessionPartInternal({ reason: 'background' });
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

    manager.startSessionPartInternal({ reason: 'init' });
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

    manager.endSessionPartInternal({ reason: 'background' });

    // Survives across user-session boundaries.
    expect(blob('embrace_permanent_properties')).to.have.property(
      propertyKey,
      value,
    );
  });

  it('should persist user-session-scoped properties inside the user-session state blob with bare keys', () => {
    const propertyKey = 'session-only-key';
    const value = 'session-only-value';
    manager.startSessionPartInternal({ reason: 'init' });
    manager.addProperty(propertyKey, value);

    // Not a top-level entry: that path is reserved for permanent properties,
    // and even there the value is stored inside a blob, never as its own key.
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

    manager.startSessionPartInternal({ reason: 'init' });
    manager.addProperty(propertyKey, value);
    manager.endSessionPartInternal({ reason: 'background' });

    const secondManager = new EmbraceUserSessionManager({
      sessionPartCounters: new InMemorySessionPartCounters(),
      diag,
      storage,
      limitManager,
      perf,
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    secondManager.startSessionPartInternal({ reason: 'init' });
    secondManager.endSessionPartInternal({ reason: 'background' });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(2);
    expect(finishedSpans[1].attributes).to.have.property(attributeKey, value);
  });

  describe('another tab sharing storage', () => {
    const createOtherTab = () =>
      new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });

    const storedState = () => {
      const raw = inMemoryStorage.getItem('embrace_user_session_state');

      return raw === null
        ? null
        : (JSON.parse(raw) as {
            userSessionId: string;
            nextUserSessionId?: string;
            ended?: boolean;
            inactivityDeadlineTs: number | null;
          });
    };

    // The other tab ends the user session while it has no part, then starts a
    // part, which creates the next user session.
    const startNextUserSessionInOtherTab = () => {
      const otherTab = createOtherTab();

      otherTab.endUserSession();
      otherTab.startSessionPartInternal({ reason: 'init' });

      return otherTab;
    };

    afterEach(() => {
      logs.disable();
    });

    it('stamps a user-session property the other tab sets during the part', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      createOtherTab().addProperty('cart-size', '3');
      manager.endSessionPartInternal({ reason: 'background' });

      expect(memoryExporter.getFinishedSpans()[0].attributes).to.have.property(
        'emb.properties.cart-size',
        '3',
      );
    });

    it('stamps a permanent property the other tab sets during the part', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      createOtherTab().addProperty('plan', 'pro', { lifespan: 'permanent' });
      manager.endSessionPartInternal({ reason: 'background' });

      expect(memoryExporter.getFinishedSpans()[0].attributes).to.have.property(
        'emb.properties.plan',
        'pro',
      );
    });

    it('reports the user session the other tab started', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'background' });

      const otherTab = startNextUserSessionInOtherTab();

      expect(manager.getUserSessionId()).to.equal(otherTab.getUserSessionId());
    });

    it("keeps another tab's part final when a hidden tab's part ends after it", () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const otherTab = createOtherTab();
      otherTab.startSessionPartInternal({ reason: 'init' });
      const otherTabPartId = otherTab.getSessionPartId();
      clock.tick(1000);
      manager.endSessionPartInternal({ reason: 'background' });

      otherTab.endUserSession();

      expect(
        memoryExporter
          .getFinishedSpans()
          .find(
            (span) => span.attributes['emb.session_part_id'] === otherTabPartId,
          )?.attributes,
      ).to.include({
        'emb.is_final_session_part': 1,
        'emb.user_session_termination_reason': 'manual',
      });
    });

    it("marks the ending tab's part final when the part with the latest activity ended first", () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const partId = manager.getSessionPartId();
      const otherTab = createOtherTab();
      clock.tick(1000);
      otherTab.startSessionPartInternal({ reason: 'init' });
      clock.tick(1000);
      otherTab.endSessionPartInternal({ reason: 'background' });

      manager.endUserSession();

      expect(
        memoryExporter
          .getFinishedSpans()
          .find((span) => span.attributes['emb.session_part_id'] === partId)
          ?.attributes,
      ).to.include({
        'emb.is_final_session_part': 1,
        'emb.user_session_termination_reason': 'manual',
      });
    });

    it('keeps the part with the latest activity final after another tab started the next user session first', () => {
      const createShortLivedTab = () =>
        new EmbraceUserSessionManager({
          sessionPartCounters: new InMemorySessionPartCounters(),
          diag,
          storage,
          limitManager,
          perf,
          visibilityDoc: window.document,
          dynamicConfigManager: createTestDynamicConfigManager({
            userSessionMaxDurationSeconds: 3600,
            userSessionForegroundInactivityTimeoutSeconds: 3600,
          }),
        });
      createShortLivedTab().startSessionPartInternal({ reason: 'init' });
      const lastActiveTab = createShortLivedTab();
      lastActiveTab.startSessionPartInternal({ reason: 'init' });
      const lastActivePartId = lastActiveTab.getSessionPartId();

      // The first tab's timer fires first, and its next part starts before
      // the last active tab's part ends.
      clock.tick(3600 * 1000);

      const finalParts = memoryExporter
        .getFinishedSpans()
        .filter((span) => span.attributes['emb.is_final_session_part'] === 1);
      expect(finalParts).to.have.lengthOf(1);
      expect(finalParts[0].attributes).to.include({
        'emb.session_part_id': lastActivePartId,
        'emb.user_session_termination_reason': 'max_duration_reached',
      });
    });

    it("stamps the part's own user session when another tab starts the next one", () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const partUserSessionId = manager.getUserSessionId();
      manager.addProperty('cart-size', '3');

      const otherTab = startNextUserSessionInOtherTab();
      otherTab.addProperty('other-only', 'yes');

      expect(manager.getUserSessionAttributes()).to.have.property(
        'emb.user_session_id',
        partUserSessionId,
      );

      manager.endSessionPartInternal({ reason: 'background' });

      const partAttributes = memoryExporter.getFinishedSpans()[0].attributes;
      expect(partAttributes).to.have.property('emb.properties.cart-size', '3');
      expect(partAttributes).to.not.have.property('emb.properties.other-only');
    });

    it("stamps the part's own user session on logs after another tab starts the next one", () => {
      const logExporter = setupTestLogExporter([
        new UserSessionLogRecordProcessor({ userSessionManager: manager }),
      ]);
      manager.startSessionPartInternal({ reason: 'init' });
      const partUserSessionId = manager.getUserSessionId();
      const sessionPartId = manager.getSessionPartId();

      startNextUserSessionInOtherTab();
      logs.getLogger('test').emit({ body: 'after the other tab' });

      const { attributes } = logExporter.getFinishedLogRecords()[0];
      expect(attributes).to.have.property(
        'emb.user_session_id',
        partUserSessionId,
      );
      expect(attributes).to.have.property('emb.session_part_id', sessionPartId);
    });

    it('creates the same next user session as another tab that read the same ended one', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
        userSessionEndReason: 'inactivity',
      });
      const endedRow = inMemoryStorage.getItem('embrace_user_session_state');
      manager.startSessionPartInternal({ reason: 'web_activity' });
      const nextUserSessionId = manager.getUserSessionId();

      // Another tab read the ended row before this tab's write reached it.
      const otherTabStorage = new InMemoryStorage();
      otherTabStorage.setItem('embrace_user_session_state', endedRow as string);
      const otherTab = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage: new NamespacedStorage({ storage: otherTabStorage, diag }),
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      otherTab.startSessionPartInternal({ reason: 'init' });

      expect(otherTab.getUserSessionId()).to.equal(nextUserSessionId);
    });

    it('ends up in the same next user session as another tab when both reach max duration', () => {
      const createShortLivedTab = () =>
        new EmbraceUserSessionManager({
          sessionPartCounters: new InMemorySessionPartCounters(),
          diag,
          storage,
          limitManager,
          perf,
          visibilityDoc: window.document,
          dynamicConfigManager: createTestDynamicConfigManager({
            userSessionMaxDurationSeconds: 3600,
            userSessionForegroundInactivityTimeoutSeconds: 3600,
          }),
        });
      const thisTab = createShortLivedTab();
      thisTab.startSessionPartInternal({ reason: 'init' });
      const otherTab = createShortLivedTab();
      otherTab.startSessionPartInternal({ reason: 'init' });
      const nextUserSessionId = storedState()?.nextUserSessionId;

      clock.tick(3600 * 1000);

      expect(thisTab.getUserSessionId()).to.equal(nextUserSessionId);
      expect(otherTab.getUserSessionId()).to.equal(nextUserSessionId);
    });

    it('links the next user session to one another tab ended', () => {
      const otherTab = createOtherTab();
      otherTab.startSessionPartInternal({ reason: 'init' });
      const endedUserSessionId = otherTab.getUserSessionId();
      otherTab.endSessionPartInternal({ reason: 'background' });
      otherTab.endUserSession();

      manager.startSessionPartInternal({ reason: 'init' });

      expect(manager.getPreviousUserSessionId()).to.equal(endedUserSessionId);
      expect(manager.getUserSessionAttributes()).to.have.property(
        'emb.user_session_number',
        2,
      );
    });

    it("doesn't write over the ended marker from a part still open in the ended user session", () => {
      manager.startSessionPartInternal({ reason: 'init' });
      createOtherTab().endUserSession();
      const endedRaw = inMemoryStorage.getItem('embrace_user_session_state');
      clock.tick(1000);

      manager.addProperty('cart-size', '3');
      manager.endSessionPartInternal({ reason: 'background' });

      expect(inMemoryStorage.getItem('embrace_user_session_state')).to.equal(
        endedRaw,
      );
    });

    it("doesn't rewrite another tab's ended marker when this tab's part ends as final", () => {
      manager.startSessionPartInternal({ reason: 'init' });
      createOtherTab().endUserSession();
      const endedRaw = inMemoryStorage.getItem('embrace_user_session_state');
      clock.tick(1000);

      manager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
        userSessionEndReason: 'inactivity',
      });

      expect(inMemoryStorage.getItem('embrace_user_session_state')).to.equal(
        endedRaw,
      );
    });

    it('creates the same next user session as another tab that read the same live one before either ended it', () => {
      const createShortLivedTab = (tabStorage: NamespacedStorage) =>
        new EmbraceUserSessionManager({
          sessionPartCounters: new InMemorySessionPartCounters(),
          diag,
          storage: tabStorage,
          limitManager,
          perf,
          visibilityDoc: window.document,
          dynamicConfigManager: createTestDynamicConfigManager({
            userSessionMaxDurationSeconds: 3600,
            userSessionForegroundInactivityTimeoutSeconds: 3600,
          }),
        });
      const thisTab = createShortLivedTab(storage);
      thisTab.startSessionPartInternal({ reason: 'init' });
      const nextUserSessionId = storedState()?.nextUserSessionId;

      // Each tab works from its own copy of the same live user session, as if
      // neither saw the other's writes before its timer fired.
      const otherTabBacking = new InMemoryStorage();
      otherTabBacking.setItem(
        'embrace_user_session_state',
        inMemoryStorage.getItem('embrace_user_session_state') as string,
      );
      const otherTab = createShortLivedTab(
        new NamespacedStorage({ storage: otherTabBacking, diag }),
      );
      otherTab.startSessionPartInternal({ reason: 'init' });

      clock.tick(3600 * 1000);

      expect(thisTab.getUserSessionId()).to.equal(nextUserSessionId);
      expect(otherTab.getUserSessionId()).to.equal(nextUserSessionId);
    });

    it('creates the next user session from the ended one it read, even if another tab replaces it right after', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
        userSessionEndReason: 'inactivity',
      });
      const endedRaw = inMemoryStorage.getItem(
        'embrace_user_session_state',
      ) as string;
      const { nextUserSessionId } = JSON.parse(endedRaw) as {
        nextUserSessionId: string;
      };

      // Another tab creates the next user session from the same ended one.
      createOtherTab().startSessionPartInternal({ reason: 'init' });

      const thisTabBacking = new InMemoryStorage();
      thisTabBacking.setItem(
        'embrace_user_session_state',
        inMemoryStorage.getItem('embrace_user_session_state') as string,
      );
      const getItem = thisTabBacking.getItem.bind(thisTabBacking);
      let staleRead: string | null = null;
      thisTabBacking.getItem = (key) => {
        if (key === 'embrace_user_session_state' && staleRead !== null) {
          const value = staleRead;
          staleRead = null;

          return value;
        }

        return getItem(key);
      };
      const thisTab = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage: new NamespacedStorage({ storage: thisTabBacking, diag }),
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      // This tab's first read still sees the ended user session; any later
      // read sees the one the other tab created.
      staleRead = endedRaw;

      thisTab.startSessionPartInternal({ reason: 'init' });

      expect(thisTab.getUserSessionId()).to.equal(nextUserSessionId);
    });

    it("keeps reporting the part's user session after another tab cleared it", () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const partUserSessionId = manager.getUserSessionId();

      inMemoryStorage.removeItem('embrace_user_session_state');

      expect(manager.getUserSessionId()).to.equal(partUserSessionId);
      expect(manager.getUserSessionAttributes()).to.have.property(
        'emb.user_session_id',
        partUserSessionId,
      );
    });

    it('keeps a property set after another tab replaced the user session on this part only', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const otherTab = startNextUserSessionInOtherTab();

      manager.addProperty('cart-size', '3');

      expect(otherTab.getSessionPartProperties()).to.not.have.property(
        'cart-size',
      );

      manager.endSessionPartInternal({ reason: 'background' });

      expect(memoryExporter.getFinishedSpans()[0].attributes).to.have.property(
        'emb.properties.cart-size',
        '3',
      );
    });

    it("reports the other tab's user session once this tab's part ends", () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const otherTab = startNextUserSessionInOtherTab();

      manager.endSessionPartInternal({ reason: 'background' });

      expect(manager.getUserSessionId()).to.equal(otherTab.getUserSessionId());
    });

    it("doesn't overwrite the other tab's user session when the part ends", () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const otherTab = startNextUserSessionInOtherTab();

      manager.endSessionPartInternal({ reason: 'background' });

      expect(storedState()?.userSessionId).to.equal(
        otherTab.getUserSessionId(),
      );
      // The other tab's part is still active, so its user session has no
      // inactivity deadline.
      void expect(storedState()?.inactivityDeadlineTs).to.be.null;
    });

    it("doesn't clear the other tab's user session when the part ends as final", () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const otherTab = startNextUserSessionInOtherTab();

      manager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
        userSessionEndReason: 'inactivity',
      });

      expect(storedState()?.userSessionId).to.equal(
        otherTab.getUserSessionId(),
      );
    });

    it("doesn't clear the other tab's user session when this tab's max-duration timer fires", () => {
      // This tab arms its max-duration timer for its user session, which then
      // expires from inactivity.
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'background' });
      clock.tick(12 * 60 * 60 * 1000 - 10 * 60 * 1000);

      // The other tab starts the next user session before this tab's timer
      // fires.
      const otherTab = createOtherTab();
      otherTab.startSessionPartInternal({ reason: 'init' });
      clock.tick(11 * 60 * 1000);

      expect(storedState()?.userSessionId).to.equal(
        otherTab.getUserSessionId(),
      );
    });

    it("rolls this tab's part over at max duration after another tab cleared the same user session", () => {
      const shortLivedManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: createTestDynamicConfigManager({
          userSessionMaxDurationSeconds: 3600,
          userSessionForegroundInactivityTimeoutSeconds: 3600,
        }),
      });
      shortLivedManager.startSessionPartInternal({ reason: 'init' });
      const userSessionId = shortLivedManager.getUserSessionId();

      // Another tab's timer for the same user session fires first and clears
      // it.
      clock.tick(3600 * 1000 - 1);
      inMemoryStorage.removeItem('embrace_user_session_state');
      clock.tick(1);

      expect(memoryExporter.getFinishedSpans()[0].attributes).to.have.property(
        'emb.user_session_termination_reason',
        'max_duration_reached',
      );
      void expect(shortLivedManager.getUserSessionId()).to.not.be.null;
      expect(shortLivedManager.getUserSessionId()).to.not.equal(userSessionId);
    });

    it('ends the user session another tab started when endUserSession() is called during this part', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const otherTab = startNextUserSessionInOtherTab();
      const otherUserSessionId = otherTab.getUserSessionId();
      // Past the endUserSession() cooldown the other tab started.
      clock.tick(5000);

      manager.endUserSession();

      void expect(manager.getUserSessionId()).to.not.be.null;
      expect(manager.getUserSessionId()).to.not.equal(otherUserSessionId);
      expect(manager.getPreviousUserSessionId()).to.equal(otherUserSessionId);
    });

    it('ends the part when endUserSession() is called after storage was cleared', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const userSessionId = manager.getUserSessionId();
      inMemoryStorage.removeItem('embrace_user_session_state');

      manager.endUserSession();

      expect(memoryExporter.getFinishedSpans()[0].attributes).to.have.property(
        'emb.user_session_termination_reason',
        'manual',
      );
      void expect(manager.getUserSessionId()).to.not.be.null;
      expect(manager.getUserSessionId()).to.not.equal(userSessionId);
    });
  });

  describe('ended user session', () => {
    const storedState = () =>
      JSON.parse(
        inMemoryStorage.getItem('embrace_user_session_state') as string,
      ) as {
        userSessionId: string;
        nextUserSessionId?: string;
        ended?: boolean;
        inactivityDeadlineTs: number | null;
        userSessionProperties: Record<string, string>;
      };

    it('leaves an ended marker and reports no user session', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const endedUserSessionId = manager.getUserSessionId();
      manager.addProperty('cart-size', '3');
      manager.endSessionPartInternal({ reason: 'background' });
      clock.tick(1000);

      manager.endUserSession();

      expect(storedState()).to.deep.include({
        userSessionId: endedUserSessionId,
        ended: true,
        endReason: 'manual',
        inactivityDeadlineTs: 1000,
        userSessionProperties: {},
      });
      void expect(manager.getUserSessionId()).to.be.null;
      void expect(manager.getUserSessionAttributes()).to.be.null;
      expect(manager.getPreviousUserSessionId()).to.equal(endedUserSessionId);
    });

    it("counts the inactivity timeout from a user session's start when the last activity is older", () => {
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
        userSessionEndReason: 'inactivity',
      });
      clock.tick(5000 * 1000);
      // Creates the next user session without any activity.
      manager.addProperty('cart-size', '3');
      const nextUserSessionId = manager.getUserSessionId();

      manager.startSessionPartInternal({ reason: 'web_activity' });

      expect(manager.getUserSessionId()).to.equal(nextUserSessionId);
    });

    it('records an inactivity end on the ended marker', () => {
      manager.startSessionPartInternal({ reason: 'init' });

      manager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
        userSessionEndReason: 'inactivity',
      });

      expect(storedState()).to.include({
        ended: true,
        endReason: 'inactivity',
      });
    });

    it('creates the next user session from the one that ended', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const ended = manager.getUserSessionAttributes();
      const { nextUserSessionId } = storedState();
      manager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
        userSessionEndReason: 'inactivity',
      });

      manager.startSessionPartInternal({ reason: 'web_activity' });

      expect(manager.getUserSessionAttributes()).to.include({
        'emb.user_session_id': nextUserSessionId,
        'emb.user_session_previous_id': ended?.['emb.user_session_id'],
        'emb.user_session_number': 2,
      });
      expect(inMemoryStorage.getItem('embrace_user_session_number')).to.equal(
        '2',
      );
    });

    it('counts from the stored user session number when there is no previous user session', () => {
      inMemoryStorage.setItem('embrace_user_session_number', '7');

      manager.startSessionPartInternal({ reason: 'init' });

      expect(manager.getUserSessionAttributes()).to.have.property(
        'emb.user_session_number',
        8,
      );
    });

    it('ignores endUserSession() after the user session ended', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
        userSessionEndReason: 'inactivity',
      });
      const endedRaw = inMemoryStorage.getItem('embrace_user_session_state');

      manager.endUserSession();

      expect(inMemoryStorage.getItem('embrace_user_session_state')).to.equal(
        endedRaw,
      );
      void expect(inMemoryStorage.getItem('embrace_last_end_user_session_ts'))
        .to.be.null;
    });

    it('creates a random next user session when the ended one has no next ID', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const ended = manager.getUserSessionAttributes();
      manager.endSessionPartInternal({ reason: 'background' });
      // A row written by an SDK version without nextUserSessionId, which
      // doesn't record the last activity either, expired.
      const { nextUserSessionId: _, ...withoutNextId } = storedState();
      inMemoryStorage.setItem(
        'embrace_user_session_state',
        JSON.stringify({ ...withoutNextId, inactivityDeadlineTs: 0 }),
      );
      inMemoryStorage.removeItem('embrace_last_activity');

      manager.startSessionPartInternal({ reason: 'foreground' });

      const next = manager.getUserSessionAttributes();
      expect(next?.['emb.user_session_id']).to.have.lengthOf(32);
      expect(next?.['emb.user_session_id']).to.not.equal(
        ended?.['emb.user_session_id'],
      );
      expect(next?.['emb.user_session_previous_id']).to.equal(
        ended?.['emb.user_session_id'],
      );
    });
  });

  describe('reacting to another tab', () => {
    const NAMESPACE = 'other-tab-test';
    const STATE_KEY = `${NAMESPACE}__embrace_user_session_state`;

    // Other test files share `localStorage`, so only this namespace's keys
    // are touched.
    const removeNamespaceKeys = () => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(`${NAMESPACE}__`)) {
          localStorage.removeItem(key);
        }
      }
    };

    // The other tab's storage: its writes reach `localStorage` and are
    // recorded as the `storage` events this tab would receive, which have to
    // carry the real `localStorage`.
    class OtherTabStorage implements Storage {
      public events: StorageEvent[] = [];

      public get length(): number {
        return localStorage.length;
      }

      public key(index: number): string | null {
        return localStorage.key(index);
      }

      public getItem(key: string): string | null {
        return localStorage.getItem(key);
      }

      public setItem(key: string, value: string): void {
        this._record(key, () => localStorage.setItem(key, value));
      }

      public removeItem(key: string): void {
        this._record(key, () => localStorage.removeItem(key));
      }

      public clear(): void {
        removeNamespaceKeys();
        this.events.push(
          new StorageEvent('storage', {
            key: null,
            storageArea: localStorage,
          }),
        );
      }

      private _record(key: string, change: () => void): void {
        const oldValue = localStorage.getItem(key);

        change();
        this.events.push(
          new StorageEvent('storage', {
            key,
            oldValue,
            newValue: localStorage.getItem(key),
            storageArea: localStorage,
          }),
        );
      }
    }

    let otherTabStorage: OtherTabStorage;
    let thisTabTarget: EventTarget;
    let thisTab: EmbraceUserSessionManager;
    let otherTab: EmbraceUserSessionManager;

    const createTab = (
      tabStorage: Storage,
      target: EventTarget,
      {
        dynamicConfigManager = TEST_DYNAMIC_CONFIG_MANAGER,
        visibilityDoc = window.document,
      }: {
        dynamicConfigManager?: ReturnType<
          typeof createTestDynamicConfigManager
        >;
        visibilityDoc?: VisibilityStateDocument;
      } = {},
    ) =>
      new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage: new NamespacedStorage({
          storage: tabStorage,
          namespace: NAMESPACE,
          diag,
        }),
        limitManager,
        perf,
        visibilityDoc,
        dynamicConfigManager,
        target,
      });

    const setUpTabs = (
      options: Parameters<typeof createTab>[2] = {},
      otherTabOptions: Parameters<typeof createTab>[2] = options,
    ) => {
      thisTab = createTab(localStorage, thisTabTarget, options);
      thisTab.setTracerProvider(trace.getTracerProvider());
      otherTab = createTab(otherTabStorage, new EventTarget(), otherTabOptions);
    };

    // Dispatches, in order, the events the other tab's writes fired.
    const deliverOtherTabWrites = () => {
      const { events } = otherTabStorage;

      otherTabStorage.events = [];

      for (const event of events) {
        thisTabTarget.dispatchEvent(event);
      }
    };

    const storedState = () =>
      JSON.parse(localStorage.getItem(STATE_KEY) as string) as {
        userSessionId: string;
        nextUserSessionId: string;
        ended?: boolean;
      };

    const ONE_HOUR_USER_SESSION = createTestDynamicConfigManager({
      userSessionMaxDurationSeconds: 3600,
      userSessionForegroundInactivityTimeoutSeconds: 3600,
    });

    beforeEach(() => {
      removeNamespaceKeys();
      otherTabStorage = new OtherTabStorage();
      thisTabTarget = new EventTarget();
    });

    afterEach(() => {
      thisTab._shutdown();
      otherTab._shutdown();
      removeNamespaceKeys();
    });

    it('ends the part when another tab ends the user session and starts the next one in the next user session', () => {
      setUpTabs();
      thisTab.startSessionPartInternal({ reason: 'init' });
      const partId = thisTab.getSessionPartId();
      const { nextUserSessionId } = storedState();

      otherTab.endUserSession();
      deliverOtherTabWrites();

      expect(memoryExporter.getFinishedSpans()[0].attributes).to.include({
        'emb.session_part_id': partId,
        'emb.session_part_end_reason': 'user_session_ended',
        'emb.is_final_session_part': 1,
        'emb.user_session_termination_reason': 'manual',
      });
      expect(thisTab.getUserSessionId()).to.equal(nextUserSessionId);
      expect(storedState().userSessionId).to.equal(nextUserSessionId);

      thisTab.endSessionPartInternal({ reason: 'background' });

      expect(memoryExporter.getFinishedSpans()[1].attributes).to.have.property(
        'emb.session_part_start_reason',
        'user_session_rollover',
      );
    });

    it('stamps a property another tab sets just before ending the user session', () => {
      setUpTabs();
      thisTab.startSessionPartInternal({ reason: 'init' });

      otherTab.addProperty('cart-size', '3');
      otherTab.endUserSession();
      deliverOtherTabWrites();

      expect(memoryExporter.getFinishedSpans()[0].attributes).to.have.property(
        'emb.properties.cart-size',
        '3',
      );
    });

    it("ends the part when another tab's max-duration timer ends the user session first", () => {
      setUpTabs({ dynamicConfigManager: ONE_HOUR_USER_SESSION });
      otherTab.addProperty('armed', 'yes');
      thisTab.startSessionPartInternal({ reason: 'init' });
      const { nextUserSessionId } = storedState();
      // This tab's own timer is late, as after sleep.
      thisTab._clearMaxDurationTimer();
      // Input keeps the foreground inactivity timer from ending the part.
      clock.tick(3000 * 1000);
      thisTabTarget.dispatchEvent(new Event('keydown'));

      clock.tick(600 * 1000);
      deliverOtherTabWrites();

      expect(memoryExporter.getFinishedSpans()[0].attributes).to.include({
        'emb.session_part_end_reason': 'user_session_ended',
        'emb.is_final_session_part': 1,
        'emb.user_session_termination_reason': 'max_duration_reached',
      });
      expect(thisTab.getUserSessionId()).to.equal(nextUserSessionId);
    });

    it('ends the part for inactivity without starting another when another tab ends the user session for inactivity', () => {
      setUpTabs();
      thisTab.startSessionPartInternal({ reason: 'init' });
      const partId = thisTab.getSessionPartId();

      otherTabStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          ...JSON.parse(localStorage.getItem(STATE_KEY) as string),
          ended: true,
          endReason: 'inactivity',
          finalSessionPartId: partId,
          inactivityDeadlineTs: 0,
          userSessionProperties: {},
        }),
      );
      deliverOtherTabWrites();

      const thisTabPart = memoryExporter
        .getFinishedSpans()
        .find((span) => span.attributes['emb.session_part_id'] === partId);
      expect(thisTabPart?.attributes).to.include({
        'emb.session_part_end_reason': 'web_foreground_inactivity',
        'emb.user_session_termination_reason': 'inactivity',
      });
      void expect(thisTab.getSessionPartId()).to.be.null;
    });

    it("ends only an idle tab's part while another tab is active, then the user session once every tab is idle", () => {
      setUpTabs();
      thisTab.startSessionPartInternal({ reason: 'init' });
      const thisTabPartId = thisTab.getSessionPartId();
      otherTab.startSessionPartInternal({ reason: 'init' });
      const otherTabPartId = otherTab.getSessionPartId();
      const userSessionId = thisTab.getUserSessionId();
      clock.tick(1000 * 1000);
      thisTabTarget.dispatchEvent(new Event('keydown'));

      // The other tab has had no input for its timeout, but this tab has.
      clock.tick(800 * 1000);

      const partSpan = (id: string | null) =>
        memoryExporter
          .getFinishedSpans()
          .find((span) => span.attributes['emb.session_part_id'] === id);
      expect(partSpan(otherTabPartId)?.attributes).to.have.property(
        'emb.session_part_end_reason',
        'web_foreground_inactivity',
      );
      expect(partSpan(otherTabPartId)?.attributes).to.not.have.property(
        'emb.user_session_termination_reason',
      );
      void expect(storedState().ended).to.be.undefined;
      expect(storedState().userSessionId).to.equal(userSessionId);
      expect(thisTab.getSessionPartId()).to.equal(thisTabPartId);
      // An idle part's end isn't activity.
      expect(
        JSON.parse(
          localStorage.getItem(`${NAMESPACE}__embrace_last_activity`) as string,
        ),
      ).to.deep.equal({
        ts: 1000 * 1000,
        sessionPartId: thisTabPartId,
        sessionPartActivityTs: 1000 * 1000,
      });

      // Now this tab has had no input for its timeout either.
      clock.tick(1000 * 1000);

      expect(partSpan(thisTabPartId)?.attributes).to.include({
        'emb.session_part_end_reason': 'web_foreground_inactivity',
        'emb.is_final_session_part': 1,
        'emb.user_session_termination_reason': 'inactivity',
      });
      expect(storedState()).to.include({
        userSessionId,
        ended: true,
      });
    });

    it('ends the part as a max-duration end when another tab replaces the user session after its max end', () => {
      setUpTabs({ dynamicConfigManager: ONE_HOUR_USER_SESSION });
      thisTab.startSessionPartInternal({ reason: 'init' });
      // This tab's own timer is late, as after sleep.
      thisTab._clearMaxDurationTimer();
      clock.tick(3000 * 1000);
      thisTabTarget.dispatchEvent(new Event('keydown'));
      clock.tick(600 * 1000);

      otherTab.addProperty('cart-size', '3');
      const replacement = storedState().userSessionId;
      deliverOtherTabWrites();

      expect(memoryExporter.getFinishedSpans()[0].attributes).to.include({
        'emb.session_part_end_reason': 'user_session_ended',
        'emb.is_final_session_part': 1,
        'emb.user_session_termination_reason': 'max_duration_reached',
      });
      expect(thisTab.getUserSessionId()).to.equal(replacement);
      void expect(thisTab.getSessionPartId()).to.not.be.null;
    });

    it('ends the part without a termination reason or a next part when another tab clears storage', () => {
      setUpTabs();
      thisTab.startSessionPartInternal({ reason: 'init' });

      otherTabStorage.clear();
      deliverOtherTabWrites();

      // The clear also removed the last activity, so no part is the final one.
      const { attributes } = memoryExporter.getFinishedSpans()[0];
      expect(attributes).to.have.property(
        'emb.session_part_end_reason',
        'user_session_ended',
      );
      expect(attributes).to.not.have.property('emb.is_final_session_part');
      expect(attributes).to.not.have.property(
        'emb.user_session_termination_reason',
      );
      void expect(thisTab.getSessionPartId()).to.be.null;
    });

    it("writes the part's user session back over a stale end of the one it follows", () => {
      setUpTabs();
      thisTab.startSessionPartInternal({ reason: 'init' });
      const endedUserSession = JSON.parse(
        localStorage.getItem(STATE_KEY) as string,
      ) as Record<string, unknown>;
      thisTab.endUserSession();
      const partId = thisTab.getSessionPartId();
      const current = storedState();

      // Another tab ends the same user session after reading it before this
      // tab's end reached it.
      otherTabStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          ...endedUserSession,
          ended: true,
          endReason: 'max_duration_reached',
          inactivityDeadlineTs: 0,
          userSessionProperties: {},
        }),
      );
      deliverOtherTabWrites();

      expect(thisTab.getSessionPartId()).to.equal(partId);
      expect(storedState()).to.include({
        userSessionId: current.userSessionId,
      });
      void expect(storedState().ended).to.be.undefined;
      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(1);
    });

    it("writes the part's user session back over a stale live copy of the one it follows", () => {
      setUpTabs();
      thisTab.startSessionPartInternal({ reason: 'init' });
      const previousRaw = localStorage.getItem(STATE_KEY) as string;
      thisTab.endUserSession();
      const partId = thisTab.getSessionPartId();
      const current = storedState();

      otherTabStorage.setItem(STATE_KEY, previousRaw);
      deliverOtherTabWrites();

      expect(thisTab.getSessionPartId()).to.equal(partId);
      expect(storedState().userSessionId).to.equal(current.userSessionId);
    });

    it("doesn't start a part when another tab ends the user session and none is open here", () => {
      setUpTabs();

      otherTab.endUserSession();
      deliverOtherTabWrites();

      void expect(thisTab.getSessionPartId()).to.be.null;
      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    });

    it("doesn't mark the part final when another tab's part had the latest activity", () => {
      setUpTabs();
      thisTab.startSessionPartInternal({ reason: 'init' });
      const partId = thisTab.getSessionPartId();
      otherTab.startSessionPartInternal({ reason: 'init' });

      otherTab.endUserSession();
      deliverOtherTabWrites();

      const thisTabPart = memoryExporter
        .getFinishedSpans()
        .find((span) => span.attributes['emb.session_part_id'] === partId);
      expect(thisTabPart?.attributes).to.have.property(
        'emb.session_part_end_reason',
        'user_session_ended',
      );
      expect(thisTabPart?.attributes).to.not.have.property(
        'emb.is_final_session_part',
      );
      expect(thisTabPart?.attributes).to.not.have.property(
        'emb.user_session_termination_reason',
      );
    });

    it("keeps this tab's part final when the tab that ended the user session started the next part first", () => {
      setUpTabs();
      otherTab.startSessionPartInternal({ reason: 'init' });
      thisTab.startSessionPartInternal({ reason: 'init' });
      const partId = thisTab.getSessionPartId();

      otherTab.endUserSession();
      deliverOtherTabWrites();

      expect(
        memoryExporter
          .getFinishedSpans()
          .find((span) => span.attributes['emb.session_part_id'] === partId)
          ?.attributes,
      ).to.include({
        'emb.is_final_session_part': 1,
        'emb.user_session_termination_reason': 'manual',
      });
    });

    it("claims the final candidate the other tab's part released, so the other tab's max-duration end marks this part final", () => {
      setUpTabs({ dynamicConfigManager: ONE_HOUR_USER_SESSION });
      // Starting after the user session does keeps this part's foreground
      // inactivity timer from firing before the max end.
      clock.tick(1000);
      thisTab.startSessionPartInternal({ reason: 'init' });
      const partId = thisTab.getSessionPartId();
      clock.tick(1000);
      otherTab.startSessionPartInternal({ reason: 'init' });
      clock.tick(1000);
      otherTab.endSessionPartInternal({ reason: 'background' });
      deliverOtherTabWrites();
      // This tab's own timer is late, so the other tab, with no part open,
      // ends the user session.
      thisTab._clearMaxDurationTimer();

      clock.tick(3597 * 1000);
      deliverOtherTabWrites();

      const finalParts = memoryExporter
        .getFinishedSpans()
        .filter((span) => span.attributes['emb.is_final_session_part'] === 1);
      expect(finalParts).to.have.lengthOf(1);
      expect(finalParts[0].attributes).to.include({
        'emb.session_part_id': partId,
        'emb.user_session_termination_reason': 'max_duration_reached',
      });
    });

    it('claims back the final candidate a stale write from the other tab released', () => {
      setUpTabs();
      otherTab.startSessionPartInternal({ reason: 'init' });
      clock.tick(1000);
      thisTab.startSessionPartInternal({ reason: 'foreground' });
      const partId = thisTab.getSessionPartId();
      otherTab.endSessionPartInternal({ reason: 'background' });
      // The other tab's part end read its own part as the final candidate,
      // missing this tab's part start, and released it.
      otherTabStorage.setItem(
        `${NAMESPACE}__embrace_last_activity`,
        JSON.stringify({
          ts: perf.getNow(),
          sessionPartId: null,
          sessionPartActivityTs: null,
        }),
      );
      deliverOtherTabWrites();

      otherTab.endUserSession();
      deliverOtherTabWrites();

      expect(
        memoryExporter
          .getFinishedSpans()
          .find((span) => span.attributes['emb.session_part_id'] === partId)
          ?.attributes,
      ).to.include({
        'emb.is_final_session_part': 1,
        'emb.user_session_termination_reason': 'manual',
      });
    });

    it("keeps the user session while another tab is active, past the deadline this tab's part end wrote", () => {
      setUpTabs();
      thisTab.startSessionPartInternal({ reason: 'init' });
      const userSessionId = thisTab.getUserSessionId();
      otherTab.startSessionPartInternal({ reason: 'init' });
      clock.tick(60 * 1000);
      otherTab.endSessionPartInternal({ reason: 'background' });

      // Input in this tab, then the other tab comes back after the deadline
      // its part end wrote.
      clock.tick(1440 * 1000);
      thisTabTarget.dispatchEvent(new Event('keydown'));
      clock.tick(500 * 1000);
      otherTab.startSessionPartInternal({ reason: 'foreground' });

      expect(otherTab.getUserSessionId()).to.equal(userSessionId);
    });

    it('records activity on a focus event while a part is open', () => {
      setUpTabs();
      thisTab.startSessionPartInternal({ reason: 'init' });
      const partId = thisTab.getSessionPartId();
      otherTab.startSessionPartInternal({ reason: 'init' });
      clock.tick(1000);

      thisTabTarget.dispatchEvent(new Event('focus'));

      expect(
        JSON.parse(
          localStorage.getItem(`${NAMESPACE}__embrace_last_activity`) as string,
        ),
      ).to.include({ sessionPartId: partId });
    });
  });

  describe('storage the page cannot reach', () => {
    let restoreStorage: () => void;
    let unreachableStorageManager: EmbraceUserSessionManager;

    beforeEach(() => {
      restoreStorage = blockWindowStorage('localStorage');
      unreachableStorageManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage: NamespacedStorage.fromWindow('localStorage', { diag }),
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
    });

    afterEach(() => {
      restoreStorage();
    });

    it('keeps user-session properties for the page', () => {
      unreachableStorageManager.startSessionPartInternal({ reason: 'init' });
      unreachableStorageManager.addProperty('cart-size', '3');
      unreachableStorageManager.endSessionPartInternal({
        reason: 'background',
      });

      expect(memoryExporter.getFinishedSpans()[0].attributes).to.have.property(
        'emb.properties.cart-size',
        '3',
      );
    });

    it('keeps permanent properties for the page', () => {
      unreachableStorageManager.startSessionPartInternal({ reason: 'init' });
      unreachableStorageManager.addProperty('plan', 'pro', {
        lifespan: 'permanent',
      });
      unreachableStorageManager.endSessionPartInternal({
        reason: 'background',
      });

      expect(memoryExporter.getFinishedSpans()[0].attributes).to.have.property(
        'emb.properties.plan',
        'pro',
      );
    });
  });

  it('should leave the persisted user-session-scoped entry intact when a permanent flip fails to write', () => {
    // An addProperty(key, val, {lifespan: 'permanent'}) call that fails to
    // persist keeps the flip in this page's memory only, so other tabs keep
    // seeing the stored user-session-scoped value.
    const backing = new InMemoryStorage();
    let permanentWriteShouldFail: boolean = false;
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
      sessionPartCounters: new InMemorySessionPartCounters(),
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
    flipManager.startSessionPartInternal({ reason: 'init' });
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

  it('should keep a user-session-scoped property for the page when storage writes fail', () => {
    const failingManager = new EmbraceUserSessionManager({
      sessionPartCounters: new InMemorySessionPartCounters(),
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
    failingManager.startSessionPartInternal({ reason: 'init' });

    expect(() => failingManager.addProperty('flag', 'on')).to.not.throw();

    expect(failingManager.getSessionPartProperties()).to.have.property(
      'flag',
      'on',
    );
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('writes disabled');
  });

  it('should clear permanent properties from the blob when removed', () => {
    const propertyKey = 'permanent-key';
    const value = 'permanent-value';

    const blob = (): Record<string, string> => {
      const raw = inMemoryStorage.getItem('embrace_permanent_properties');
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    };

    manager.startSessionPartInternal({ reason: 'init' });
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    expect(blob()).to.have.property(propertyKey, value);
    manager.endSessionPartInternal({ reason: 'background' });

    manager.startSessionPartInternal({ reason: 'init' });
    manager.removeProperty(propertyKey);
    void expect(blob()[propertyKey]).to.be.undefined;
    manager.endSessionPartInternal({ reason: 'background' });

    void expect(blob()[propertyKey]).to.be.undefined;
  });

  it('should carry both permanent and non-permanent properties across part transitions within the same user session', () => {
    // Non-permanent properties survive part end and apply to the next part:
    // they are persisted inside the user-session state blob alongside the
    // rest of the user-session state, while permanent properties are stored in
    // the permanent-properties blob. Without a user-session boundary,
    // ending the part is a part transition only, so both kinds carry over.
    const sessionOnlyPropertyKey = 'session-only-key';
    const sessionOnlyValue = 'session-only-value';
    const permanentPropertyKey = 'permanent-key';
    const permanentValue = 'permanent-value';

    manager.startSessionPartInternal({ reason: 'init' });
    manager.addProperty(sessionOnlyPropertyKey, sessionOnlyValue);
    manager.addProperty(permanentPropertyKey, permanentValue, {
      lifespan: 'permanent',
    });
    manager.endSessionPartInternal({ reason: 'background' });

    manager.startSessionPartInternal({ reason: 'init' });
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

    manager.startSessionPartInternal({ reason: 'init' });
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

    manager.startSessionPartInternal({ reason: 'init' });
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    manager.endSessionPartInternal({ reason: 'background' });

    manager.startSessionPartInternal({ reason: 'init' });
    manager.removeProperty(propertyKey);
    manager.endSessionPartInternal({ reason: 'background' });

    manager.startSessionPartInternal({ reason: 'init' });
    expect(manager.getSessionPartProperties()).to.not.have.property(
      propertyKey,
      value,
    );
  });

  it('should handle removing permanent properties that have long keys', () => {
    const propertyKey = 'permanent-key-that-is-longer-than-the-character-limit';
    const truncatedKey = 'permanent-key-that-i';
    const value = 'permanent-value';

    manager.startSessionPartInternal({ reason: 'init' });
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    manager.endSessionPartInternal({ reason: 'background' });

    manager.startSessionPartInternal({ reason: 'init' });
    expect(manager.getSessionPartProperties()).to.have.property(
      truncatedKey,
      value,
    );
    expect(manager.getSessionPartProperties()).to.not.have.property(
      propertyKey,
      value,
    );
    manager.removeProperty(propertyKey);
    manager.endSessionPartInternal({ reason: 'background' });

    manager.startSessionPartInternal({ reason: 'init' });
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
      sessionPartCounters: new InMemorySessionPartCounters(),
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

    failingManager.startSessionPartInternal({ reason: 'init' });
    failingManager.endSessionPartInternal({ reason: 'background' });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);

    // NamespacedStorage emits a single error on the first failed write and warns
    // on each failed read; the manager keeps recording in-memory.
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('writes disabled');
  });

  it('should keep a permanent property for the page when storage writes fail', () => {
    const failingManager = new EmbraceUserSessionManager({
      sessionPartCounters: new InMemorySessionPartCounters(),
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
    failingManager.startSessionPartInternal({ reason: 'init' });

    expect(() =>
      failingManager.addProperty('flag', 'on', { lifespan: 'permanent' }),
    ).to.not.throw();

    expect(failingManager.getSessionPartProperties()).to.have.property(
      'flag',
      'on',
    );
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('writes disabled');
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
      sessionPartCounters: new InMemorySessionPartCounters(),
      diag,
      limitManager,
      perf,
      storage: new NamespacedStorage({ storage: flakyStorage, diag }),
      visibilityDoc: window.document,
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
    });
    flakyManager.startSessionPartInternal({ reason: 'init' });

    expect(() => flakyManager.removeProperty('flag')).to.not.throw();
    expect(
      diag.getWarnLogs().some((m) => m.includes('failed to remove')),
    ).to.equal(true);
  });

  it('should be a silent no-op when removeProperty is called for a key that was never set', () => {
    manager.startSessionPartInternal({ reason: 'init' });
    expect(() => manager.removeProperty('never-set')).to.not.throw();
    // No storage write happens, no warning is logged.
    expect(
      diag.getWarnLogs().some((l) => l.includes('removing permanent')),
    ).to.equal(false);
  });

  it('should allow setting a different trace provider', () => {
    const secondMemoryExporter = new InMemorySpanExporter();
    const tracerProvider = new TracerProvider({
      spanProcessors: [
        new SimpleSpanProcessor({ exporter: secondMemoryExporter }),
      ],
    });

    manager.setTracerProvider(tracerProvider);
    manager.startSessionPartInternal({ reason: 'init' });
    manager.endSessionPartInternal({ reason: 'background' });

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    expect(secondMemoryExporter.getFinishedSpans()).to.have.lengthOf(1);
  });

  describe('user session attribute integration', () => {
    it('should attach user session attributes to the session part span', async () => {
      const exporter = new InMemorySpanExporter();
      const tracerProvider = new TracerProvider({
        spanProcessors: [new SimpleSpanProcessor({ exporter })],
      });
      manager.setTracerProvider(tracerProvider);

      manager.startSessionPartInternal({ reason: 'init' });
      await counters.settled();
      manager.endSessionPartInternal({ reason: 'background' });

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
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage,
        limitManager,
        perf,
        dynamicConfigManager: createTestDynamicConfigManager({
          userSessionMaxDurationSeconds: 3600,
        }),
        visibilityDoc: window.document,
      });

      localManager.startSessionPartInternal({ reason: 'init' });
      const firstPartId = localManager.getSessionPartId();

      localManager.endUserSession();

      expect(localManager.getSessionPartId()).to.not.equal(firstPartId);
      expect(localManager.getSessionPartId()).to.not.equal(null);
    });

    it('should mark the session part as final when user session terminates', () => {
      manager.startSessionPartInternal({ reason: 'init' });
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
      // An inactivity-deadline write during termination would emit a stray
      // storage event. The manager skips the deadline write when the reason is
      // 'user_session_ended', so termination produces only the ended marker
      // followed by the new user session's first write.
      const stateOps: Array<'end' | 'set' | 'remove'> = [];
      const spyBacking = new InMemoryStorage();
      const originalSet = spyBacking.setItem.bind(spyBacking);
      const originalRemove = spyBacking.removeItem.bind(spyBacking);
      spyBacking.setItem = (key, value) => {
        if (key === 'embrace_user_session_state') {
          stateOps.push(
            (JSON.parse(value) as { ended?: boolean }).ended ? 'end' : 'set',
          );
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
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage: new NamespacedStorage({ storage: spyBacking, diag }),
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });

      localManager.startSessionPartInternal({ reason: 'init' });
      stateOps.length = 0;

      localManager.endUserSession();

      // Exactly two storage ops: the ended marker, then the rollover user
      // session. No intermediate set with a stale continuation snapshot.
      expect(stateOps).to.deep.equal(['end', 'set']);
    });

    it('should mark part as final when max duration timer fires during active part', () => {
      const localManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
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

      localManager.startSessionPartInternal({ reason: 'init' });

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
      // while the tab is hidden. The next engagement event
      // (handled by the manager's browser-activity listeners in production) is
      // what starts the new part.
      const visibilityState: { current: 'visible' | 'hidden' } = {
        current: 'visible',
      };
      const visibilityDoc: VisibilityStateDocument = {
        get visibilityState() {
          return visibilityState.current;
        },
      };

      const localManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        perf,
        storage,
        limitManager,
        visibilityDoc,
        // Match the foreground inactivity timeout to max: same-delay timers
        // fire in registration order, and max-duration is armed in
        // _loadOrCreateUserSessionState before startSessionPartInternal arms
        // the foreground inactivity timer.
        dynamicConfigManager: createTestDynamicConfigManager({
          userSessionMaxDurationSeconds: 3600,
          userSessionInactivityTimeoutSeconds: 3600,
          userSessionForegroundInactivityTimeoutSeconds: 3600,
        }),
      });

      localManager.startSessionPartInternal({ reason: 'init' });
      const firstUserSessionId = localManager.getUserSessionId();
      const firstPartId = localManager.getSessionPartId();
      void expect(firstPartId).to.not.be.null;

      // Tab is no longer engaged before the max-duration boundary.
      visibilityState.current = 'hidden';

      clock.tick(3601 * 1000);

      // Max-duration ended the old part and the user session, but the
      // rollover startSessionPartInternal skipped because the tab is hidden.
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
      // call startSessionPartInternal({ reason: 'foreground' }) in production;
      // simulate that here. A new user session is created.
      visibilityState.current = 'visible';
      localManager.startSessionPartInternal({ reason: 'foreground' });

      void expect(localManager.getSessionPartId()).to.not.be.null;
      expect(localManager.getSessionPartId()).to.not.equal(firstPartId);
      expect(localManager.getUserSessionId()).to.not.equal(firstUserSessionId);
    });

    it('should find the inactivity deadline expired on the next part start and roll a new user session', () => {
      // No timer runs for the inactivity deadline; the next part start finds it
      // expired, after the previous part span has already been exported
      // without emb.is_final_session_part.
      const localManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        perf,
        storage,
        limitManager,
        dynamicConfigManager: createTestDynamicConfigManager({
          userSessionInactivityTimeoutSeconds: 60,
        }),
        visibilityDoc: window.document,
      });

      localManager.startSessionPartInternal({ reason: 'init' });
      const firstUserSessionId = localManager.getUserSessionId();
      localManager.endSessionPartInternal({ reason: 'background' });

      clock.tick(61 * 1000);

      localManager.startSessionPartInternal({ reason: 'init' });
      const secondUserSessionId = localManager.getUserSessionId();

      expect(secondUserSessionId).to.not.equal(firstUserSessionId);
    });

    it('should keep the same user session id across consecutive parts within inactivity timeout', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      const firstUserSessionId = manager.getUserSessionId();
      manager.endSessionPartInternal({ reason: 'background' });

      manager.startSessionPartInternal({ reason: 'init' });
      const secondUserSessionId = manager.getUserSessionId();

      expect(secondUserSessionId).to.equal(firstUserSessionId);
    });

    it('should stamp emb.user_session_previous_id on a part span created during a user-session rollover', () => {
      const exporter = new InMemorySpanExporter();
      const tracerProvider = new TracerProvider({
        spanProcessors: [new SimpleSpanProcessor({ exporter })],
      });
      const localManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      localManager.setTracerProvider(tracerProvider);

      localManager.startSessionPartInternal({ reason: 'init' });
      const firstUserSessionId = localManager.getUserSessionId();
      void expect(firstUserSessionId).to.not.be.null;

      // Triggers endUserSession -> rollover -> a fresh user session and a
      // brand new part span. The new part span must have the previous user
      // session's id on emb.user_session_previous_id.
      localManager.endUserSession();
      localManager.endSessionPartInternal({ reason: 'background' });

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
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'background' });

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_start_reason',
        'init',
      );
    });

    it('should stamp "activity" on the part span when started with that reason', () => {
      manager.startSessionPartInternal({ reason: 'web_activity' });
      manager.endSessionPartInternal({ reason: 'background' });

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_start_reason',
        'web_activity',
      );
    });

    it('should stamp "user_session_rollover" on the part span started by user-session rollover', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      // Triggers the rollover path inside endUserSession, which restarts a
      // part with reason 'user_session_rollover'.
      manager.endUserSession();
      manager.endSessionPartInternal({ reason: 'background' });

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
        sessionPartCounters: new InMemorySessionPartCounters(),
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

      localManager.startSessionPartInternal({ reason: 'init' });

      clock.tick(3601 * 1000);

      localManager.endSessionPartInternal({ reason: 'background' });

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
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'background' });

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_end_reason',
        'background',
      );
    });

    it('should stamp "web_foreground_inactivity" when the inactivity timer ends the part', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'web_foreground_inactivity' });

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_end_reason',
        'web_foreground_inactivity',
      );
    });

    it('should stamp "user_session_ended" when the user-session manager ends the part on rollover', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endUserSession();
      manager.endSessionPartInternal({ reason: 'background' });

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_end_reason',
        'user_session_ended',
      );
      expect(finishedSpans[1].attributes).to.have.property(
        'emb.session_part_end_reason',
        'background',
      );
    });
  });

  describe('emb.session_part_number', () => {
    it('emits a 1-indexed monotonic counter on the part span, persisted across visits', async () => {
      manager.startSessionPartInternal({ reason: 'init' });
      await counters.settled();
      manager.endSessionPartInternal({ reason: 'background' });
      manager.startSessionPartInternal({ reason: 'init' });
      await counters.settled();
      manager.endSessionPartInternal({ reason: 'background' });

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

  describe('shared session part counters', () => {
    // Hands out each part's counters only when the test reserves them, as
    // IndexedDB does some time after the part starts.
    const createDeferredCounters = () => {
      const increments: Array<{
        args: IncrementSessionPartCountsArgs;
        promise: Promise<SessionPartCounts>;
        resolve: (counts: SessionPartCounts) => void;
      }> = [];
      const deferredCounters: SessionPartCounters = {
        increment: (args) => {
          let resolve: (counts: SessionPartCounts) => void = () => {};
          const promise = new Promise<SessionPartCounts>((resolvePromise) => {
            resolve = resolvePromise;
          });

          increments.push({ args, promise, resolve });

          return promise;
        },
      };

      // The manager's handler is registered first, so it has run once the
      // increment's promise is awaited here.
      const reserve = async (index: number, counts: SessionPartCounts) => {
        increments[index].resolve(counts);
        await increments[index].promise;
      };

      return { deferredCounters, increments, reserve };
    };

    const createManagerWith = (sessionPartCounters: SessionPartCounters) =>
      new EmbraceUserSessionManager({
        sessionPartCounters,
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });

    const readStoredUserSession = () =>
      JSON.parse(
        inMemoryStorage.getItem('embrace_user_session_state') as string,
      ) as { userSessionId: string; userSessionPartIndex: number };

    it("sets the counters on the part span once they're reserved, and records the index on the user-session row", async () => {
      const { deferredCounters, increments, reserve } =
        createDeferredCounters();
      const localManager = createManagerWith(deferredCounters);

      localManager.startSessionPartInternal({ reason: 'init' });

      expect(increments).to.have.lengthOf(1);
      expect(increments[0].args).to.deep.equal({
        userSessionId: localManager.getUserSessionId(),
        storedUserSessionPartIndex: 0,
      });

      void expect(localManager.getSessionPartCounts()).to.be.null;

      await reserve(0, { sessionPartNumber: 7, userSessionPartIndex: 3 });

      expect(readStoredUserSession().userSessionPartIndex).to.equal(3);
      expect(localManager.getSessionPartCounts()).to.deep.equal({
        sessionPartNumber: 7,
        userSessionPartIndex: 3,
      });

      localManager.endSessionPartInternal({ reason: 'background' });

      void expect(localManager.getSessionPartCounts()).to.be.null;

      const [span] = memoryExporter.getFinishedSpans();
      expect(span.attributes).to.include({
        'emb.session_part_number': 7,
        'emb.user_session_part_index': 3,
      });
      expect(readStoredUserSession().userSessionPartIndex).to.equal(3);
    });

    it("leaves the counters off a part that ends before they're reserved", async () => {
      const { deferredCounters, reserve } = createDeferredCounters();
      const localManager = createManagerWith(deferredCounters);

      localManager.startSessionPartInternal({ reason: 'init' });
      localManager.endSessionPartInternal({ reason: 'background' });
      await reserve(0, { sessionPartNumber: 1, userSessionPartIndex: 1 });

      const [span] = memoryExporter.getFinishedSpans();
      expect(span.attributes).to.not.have.property('emb.session_part_number');
      expect(span.attributes).to.not.have.property(
        'emb.user_session_part_index',
      );
      // Nothing carries it, so the row doesn't count it.
      expect(readStoredUserSession().userSessionPartIndex).to.equal(0);
    });

    it('keeps a late reservation off the next part', async () => {
      const { deferredCounters, reserve } = createDeferredCounters();
      const localManager = createManagerWith(deferredCounters);

      localManager.startSessionPartInternal({ reason: 'init' });
      localManager.endSessionPartInternal({ reason: 'background' });
      localManager.startSessionPartInternal({ reason: 'init' });
      await reserve(1, { sessionPartNumber: 2, userSessionPartIndex: 2 });
      await reserve(0, { sessionPartNumber: 1, userSessionPartIndex: 1 });
      localManager.endSessionPartInternal({ reason: 'background' });

      const [, second] = memoryExporter.getFinishedSpans();
      expect(second.attributes).to.include({
        'emb.session_part_number': 2,
        'emb.user_session_part_index': 2,
      });
      expect(readStoredUserSession().userSessionPartIndex).to.equal(2);
    });

    it("doesn't lower the index another tab recorded on the row", async () => {
      const { deferredCounters, reserve } = createDeferredCounters();
      const thisTab = createManagerWith(deferredCounters);
      const otherTab = createManagerWith(deferredCounters);

      thisTab.startSessionPartInternal({ reason: 'init' });
      otherTab.startSessionPartInternal({ reason: 'init' });
      await reserve(1, { sessionPartNumber: 2, userSessionPartIndex: 2 });
      await reserve(0, { sessionPartNumber: 1, userSessionPartIndex: 1 });
      thisTab.endSessionPartInternal({ reason: 'background' });

      const [span] = memoryExporter.getFinishedSpans();
      expect(span.attributes).to.include({
        'emb.session_part_number': 1,
        'emb.user_session_part_index': 1,
      });
      expect(readStoredUserSession().userSessionPartIndex).to.equal(2);
    });

    it('warns and leaves the counters off when they cannot be reserved', async () => {
      const failure = Promise.reject(new Error('counters unavailable'));
      const localManager = createManagerWith({ increment: () => failure });

      localManager.startSessionPartInternal({ reason: 'init' });
      await clock.tickAsync(0);
      localManager.endSessionPartInternal({ reason: 'background' });

      const [span] = memoryExporter.getFinishedSpans();
      expect(span.attributes).to.not.have.property('emb.session_part_number');
      expect(diag.getWarnLogs()).to.include(
        'Error reserving session part counters',
      );
    });
  });

  describe('continuation inactivity handling', () => {
    it('should clear the persisted inactivity deadline when a part continues an active user session', () => {
      const localManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
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

      localManager.startSessionPartInternal({ reason: 'init' });
      localManager.endSessionPartInternal({ reason: 'background' });

      // End-of-part writes an inactivity deadline onto the state row.
      const deadlineAfterEnd = readDeadline();
      void expect(deadlineAfterEnd).to.not.be.null;
      expect(deadlineAfterEnd).to.be.a('number');

      clock.tick(1000);

      // A continuing part (started before the inactivity deadline) must clear
      // the deadline so a future part-start doesn't read a stale value.
      localManager.startSessionPartInternal({ reason: 'init' });

      void expect(readDeadline()).to.be.null;
    });

    it('computes the persisted inactivity deadline from now even when the part end is anchored', () => {
      const localManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
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

      localManager.startSessionPartInternal({ reason: 'init' });
      clock.tick(5000);
      const boundaryTimestamp = perf.getNow();
      // Advance the clock so now and the anchor diverge. The anchored
      // timestamp is a span-presentation concern only and must not move
      // the inactivity deadline earlier.
      clock.tick(250);
      localManager.endSessionPartInternal({
        reason: 'background',
        timestamp: boundaryTimestamp,
      });

      expect(readDeadline()).to.equal(boundaryTimestamp + 250 + 60000);
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

      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'background' });

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

      manager.startSessionPartInternal({ reason: 'init' });
      void expect(manager.getSessionPartSpan()).to.not.be.null;

      expect(() =>
        manager.endSessionPartInternal({ reason: 'background' }),
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
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'background' });
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'background' });
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'background' });

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
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'background' });

      const secondManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      secondManager.startSessionPartInternal({ reason: 'init' });
      secondManager.endSessionPartInternal({ reason: 'background' });

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

  describe('SDK startup timings', () => {
    const STARTUP_KEYS = [
      'emb.sdk_startup_duration',
      'emb.sdk_load_origin_offset',
      'emb.sdk_init_origin_offset',
    ];

    it('should omit them from the cold-start part when never recorded', () => {
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'background' });

      const [coldStartSpan] = memoryExporter.getFinishedSpans();
      for (const key of STARTUP_KEYS) {
        expect(coldStartSpan.attributes).to.not.have.property(key);
      }
    });

    describe('when recorded', () => {
      beforeEach(() => {
        manager.recordSDKStartupTimings({
          initDuration: 12.4,
          loadOriginOffset: 1_000.25,
          initOriginOffset: 1_500.75,
        });
      });

      const expectStampedOnFirstPartOnly = () => {
        const finishedSpans = memoryExporter.getFinishedSpans();
        expect(finishedSpans).to.have.lengthOf(2);
        expect(finishedSpans[0].attributes).to.deep.include({
          'emb.sdk_startup_duration': 13,
          'emb.sdk_load_origin_offset': 1_000.25,
          'emb.sdk_init_origin_offset': 1_500.75,
        });
        for (const key of STARTUP_KEYS) {
          expect(finishedSpans[1].attributes).to.not.have.property(key);
        }
      };

      it('should stamp them on the cold-start part only', () => {
        manager.startSessionPartInternal({ reason: 'init' });
        manager.endSessionPartInternal({ reason: 'background' });
        manager.startSessionPartInternal({ reason: 'init' });
        manager.endSessionPartInternal({ reason: 'background' });

        expectStampedOnFirstPartOnly();
      });

      it('should stamp them on the cold-start part when it ends via rollover', () => {
        manager.startSessionPartInternal({ reason: 'init' });
        manager.rolloverSessionPartInternal({
          endReason: 'web_soft_navigation',
          startReason: 'web_soft_navigation',
        });
        manager.endSessionPartInternal({ reason: 'background' });

        expectStampedOnFirstPartOnly();
      });
    });
  });

  describe('emb.page_load attribute', () => {
    const makeDoc = (
      readyState: DocumentReadyState,
    ): VisibilityStateDocument => ({
      visibilityState: 'visible',
      readyState,
    });

    it('should set emb.page_load = true when readyState is complete at part end', () => {
      const localManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: makeDoc('complete'),
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      localManager.startSessionPartInternal({ reason: 'init' });
      localManager.endSessionPartInternal({ reason: 'background' });

      const [span] = memoryExporter.getFinishedSpans();
      expect(span.attributes).to.have.property(KEY_EMB_PAGE_LOAD, true);
    });

    it('should set emb.page_load = false when readyState is not complete at part end', () => {
      const localManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: makeDoc('loading'),
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      localManager.startSessionPartInternal({ reason: 'init' });
      localManager.endSessionPartInternal({ reason: 'background' });

      const [span] = memoryExporter.getFinishedSpans();
      expect(span.attributes).to.have.property(KEY_EMB_PAGE_LOAD, false);
    });

    it('should not set emb.page_load on non-cold-start parts', () => {
      const localManager = new EmbraceUserSessionManager({
        sessionPartCounters: new InMemorySessionPartCounters(),
        diag,
        storage,
        limitManager,
        perf,
        visibilityDoc: makeDoc('loading'),
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });
      localManager.startSessionPartInternal({ reason: 'init' });
      localManager.endSessionPartInternal({ reason: 'background' });
      localManager.startSessionPartInternal({ reason: 'foreground' });
      localManager.endSessionPartInternal({ reason: 'background' });

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      expect(finishedSpans[1].attributes).to.not.have.property(
        KEY_EMB_PAGE_LOAD,
      );
    });
  });
});
