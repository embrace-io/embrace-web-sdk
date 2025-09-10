import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import * as chai from 'chai';
import * as sinon from 'sinon';
import type { SinonSandbox } from 'sinon';
import sinonChai from 'sinon-chai';
import type { VisibilityStateDocument } from '../../common/index.js';
import {
  KEY_EMB_SESSION_REASON_ENDED,
  KEY_EMB_SESSION_REASON_STARTED,
  KEY_PREFIX_EMB_PROPERTIES,
  KEY_EMB_TAB_ID,
  KEY_EMB_PARENT_TAB_ID,
  KEY_EMB_EXPERIENCE_ID,
} from '../../constants/attributes.js';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
  MockPerformanceManager,
  setupTestTraceExporter,
} from '../../testUtils/index.js';
import { EmbraceSpanSessionManager } from './EmbraceSpanSessionManager.js';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
} from '../EmbraceLimitManager/index.js';
import {
  EMBRACE_TAB_STORAGE_KEY,
  EMBRACE_TAB_ACTIVITY_STORAGE_KEY,
} from './constants.js';
import type { Tab, LastTabActivity } from './types.js';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceSpanSessionManager', () => {
  let manager: EmbraceSpanSessionManager;
  let memoryExporter: InMemorySpanExporter;
  let diag: InMemoryDiagLogger;
  let storage: InMemoryStorage;
  let limitManager: EmbraceLimitManager;

  before(() => {
    memoryExporter = setupTestTraceExporter();
    storage = new InMemoryStorage();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
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

    manager = new EmbraceSpanSessionManager({ diag, storage, limitManager });
    storage.clear();
  });

  it('should initialize a EmbraceSpanSessionManager', () => {
    expect(manager).to.be.instanceOf(EmbraceSpanSessionManager);
  });

  it('should start a session span', () => {
    void expect(manager.getSessionSpan()).to.be.null;
    void expect(manager.getSessionId()).to.be.null;
    void expect(manager.getSessionStartTime()).to.be.null;
    manager.startSessionSpan();
    void expect(manager.getSessionSpan()).to.not.be.null;
    void expect(manager.getSessionId()).to.not.be.null;
    void expect(manager.getSessionStartTime()).to.not.be.null;
  });

  it('should end the session span', () => {
    void expect(manager.getSessionSpan()).to.be.null;
    void expect(manager.getSessionId()).to.be.null;
    void expect(manager.getSessionStartTime()).to.be.null;
    manager.startSessionSpan();
    void expect(manager.getSessionSpan()).to.not.be.null;
    const sessionID = manager.getSessionId();
    void expect(sessionID).to.not.be.null;
    void expect(manager.getSessionStartTime()).to.not.be.null;
    manager.endSessionSpan();
    void expect(manager.getSessionSpan()).to.be.null;
    void expect(manager.getSessionId()).to.be.null;
    void expect(manager.getSessionStartTime()).to.be.null;
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'manual'
    );
    expect(sessionSpan.attributes).to.have.property(ATTR_SESSION_ID, sessionID);
  });

  it('should end the current session span when starting a new one', () => {
    void expect(manager.getSessionSpan()).to.be.null;
    void expect(manager.getSessionId()).to.be.null;
    void expect(manager.getSessionStartTime()).to.be.null;
    manager.startSessionSpan();
    void expect(manager.getSessionSpan()).to.not.be.null;
    const sessionID = manager.getSessionId();
    void expect(sessionID).to.not.be.null;
    void expect(manager.getSessionStartTime()).to.not.be.null;
    manager.startSessionSpan();
    void expect(manager.getSessionSpan()).to.not.be.null;
    void expect(manager.getSessionId()).to.not.be.null;
    void expect(manager.getSessionStartTime()).to.not.be.null;
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'manual'
    );
    expect(sessionSpan.attributes).to.have.property(ATTR_SESSION_ID, sessionID);
  });

  it('should not end a session if there is no active session', () => {
    manager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(0);
    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'trying to end a session, but there is no session in progress. This is a no-op.'
    );
  });

  it('should not fail if trying to add breadcrumb to non active session', () => {
    manager.addBreadcrumb('some breadcrumb');

    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'trying to add breadcrumb to a session, but there is no session in progress. This is a no-op.'
    );
  });

  it('should add breadcrumb to session span', () => {
    manager.startSessionSpan();
    void expect(manager.getSessionSpan()).to.not.be.null;
    void expect(manager.getSessionId()).to.not.be.null;
    void expect(manager.getSessionStartTime()).to.not.be.null;

    manager.addBreadcrumb('some breadcrumb');
    manager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    expect(sessionSpan.events[0].name).to.equal('emb-breadcrumb');
    expect(sessionSpan.events[0].attributes).to.have.property(
      'message',
      'some breadcrumb'
    );
  });

  it('should not fail if trying to add properties to non active session', () => {
    manager.addProperty('custom-property-1', 'custom value1');

    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'trying to add properties to a session, but there is no session in progress. This is a no-op.'
    );
  });

  it('should add properties to session span', () => {
    manager.startSessionSpan();

    manager.addProperty('custom-property-1', 'custom value1');
    manager.addProperty('custom-property-2', 'custom value2');
    manager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];

    expect(sessionSpan.attributes).to.have.property(
      'emb.properties.custom-property-1',
      'custom value1'
    );
    expect(sessionSpan.attributes).to.have.property(
      'emb.properties.custom-property-2',
      'custom value2'
    );
    expect(sessionSpan.attributes).to.have.property(
      'emb.session_end_type',
      'manual'
    );
    expect(sessionSpan.attributes).to.have.property('emb.type', 'ux.session');
  });

  it('should start a foreground session when the document is visible', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
    };
    const manager = new EmbraceSpanSessionManager({
      visibilityDoc,
      limitManager,
    });
    manager.startSessionSpan();
    manager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property('emb.state', 'foreground');
  });

  it('should start a background session when the document is hidden', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'hidden',
    };
    const manager = new EmbraceSpanSessionManager({
      visibilityDoc,
      limitManager,
    });
    manager.startSessionSpan();
    manager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property('emb.state', 'background');
  });

  it('should call the session start listener when starting a session', () => {
    const listener = sinon.stub();
    const manager = new EmbraceSpanSessionManager({ limitManager });
    const removeListener = manager.addSessionStartedListener(listener);

    void expect(listener.calledOnce).to.be.false;

    manager.startSessionSpan();

    void expect(listener.calledOnce).to.be.true;

    removeListener();
    manager.startSessionSpan();

    void expect(listener.calledOnce).to.be.true;
  });

  it('should call the session ended listener when ending a session', () => {
    const listener = sinon.stub();
    const manager = new EmbraceSpanSessionManager({ limitManager });
    const removeListener = manager.addSessionEndedListener(listener);

    void expect(listener.calledOnce).to.be.false;

    manager.startSessionSpan();
    manager.endSessionSpan();

    void expect(listener.calledOnce).to.be.true;

    removeListener();
    manager.startSessionSpan();
    manager.endSessionSpan();

    void expect(listener.calledOnce).to.be.true;
  });

  it('should limit the amount of breadcrumbs per session', () => {
    manager.startSessionSpan();

    for (let i = 0; i < 10; i++) {
      manager.addBreadcrumb('this is a breadcrumb');
    }

    manager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(3);

    for (let i = 0; i < 3; i++) {
      expect(sessionSpan.events[i].name).to.equal('emb-breadcrumb');
      expect(sessionSpan.events[i].attributes).to.have.property(
        'message',
        'this is a breadcrumb'
      );
    }

    expect(
      sessionSpan.attributes['emb.app.applied_limit.breadcrumb.drop.count']
    ).to.be.equal(7);

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.have.lengthOf(7);
    for (let i = 0; i < warningLogs.length; i++) {
      expect(warningLogs[i]).to.equal(
        'disallowing breadcrumb because the maximum number of 3 has already been reached for this session'
      );
    }

    // A new session should reset the limit
    memoryExporter.reset();
    manager.startSessionSpan();
    manager.addBreadcrumb('this is a breadcrumb');
    manager.endSessionSpan();
    const nextSessionFinishedSpans = memoryExporter.getFinishedSpans();
    expect(nextSessionFinishedSpans).to.have.lengthOf(1);
    const nexSessionSpan = nextSessionFinishedSpans[0];
    expect(nexSessionSpan.events).to.have.lengthOf(1);
    expect(nexSessionSpan.events[0].name).to.equal('emb-breadcrumb');
    expect(nexSessionSpan.events[0].attributes).to.have.property(
      'message',
      'this is a breadcrumb'
    );
  });

  it('should truncate breadcrumb names', () => {
    manager.startSessionSpan();

    manager.addBreadcrumb('this is a breadcrumb');
    manager.addBreadcrumb(
      'this is a breadcrumb which has a name longer than the allowed maximum length'
    );

    manager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(2);
    expect(sessionSpan.events[0].name).to.equal('emb-breadcrumb');
    expect(sessionSpan.events[0].attributes).to.have.property(
      'message',
      'this is a breadcrumb'
    );
    expect(sessionSpan.events[1].name).to.equal('emb-breadcrumb');
    expect(sessionSpan.events[1].attributes).to.have.property(
      'message',
      'this is a breadcrumb which has a name longer than '
    );

    expect(
      sessionSpan.attributes[
        'emb.app.applied_limit.breadcrumb.truncate_string.count'
      ]
    ).to.be.equal(1);

    expect(diag.getWarnLogs()).to.have.lengthOf(1);
    expect(diag.getWarnLogs()[0]).to.equal(
      'truncating breadcrumb because it is longer than 50 characters: "this is a breadcrumb which has a name longer than the allowed maximum length"'
    );
  });

  it('should limit the amount of session properties per session', () => {
    manager.startSessionSpan();

    for (let i = 0; i < 10; i++) {
      manager.addProperty(`property${i.toString()}`, i.toString());
    }

    manager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];

    for (let i = 0; i < 10; i++) {
      const prop = `emb.properties.property${i.toString()}`;
      if (i < 4) {
        void expect(sessionSpan.attributes).to.have.property(
          prop,
          i.toString()
        );
      } else {
        void expect(sessionSpan.attributes).not.to.have.property(prop);
      }
    }

    expect(
      sessionSpan.attributes[
        'emb.app.applied_limit.session_property.drop.count'
      ]
    ).to.be.equal(6);

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.have.lengthOf(6);
    for (let i = 0; i < warningLogs.length; i++) {
      expect(warningLogs[i]).to.equal(
        'disallowing session_property because the maximum number of 4 has already been reached for this session'
      );
    }

    // A new session should reset the limit
    memoryExporter.reset();
    manager.startSessionSpan();
    manager.addProperty('my-new-prop', 'new');
    manager.endSessionSpan();
    const nextSessionFinishedSpans = memoryExporter.getFinishedSpans();
    expect(nextSessionFinishedSpans).to.have.lengthOf(1);
    const nexSessionSpan = nextSessionFinishedSpans[0];
    expect(nexSessionSpan.attributes).to.have.property(
      'emb.properties.my-new-prop',
      'new'
    );
  });

  it('should truncate session property keys and values', () => {
    manager.startSessionSpan();

    manager.addProperty('key1', '1');
    manager.addProperty(
      'session-property-with-long-key',
      'session property long value with extra information'
    );

    manager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];

    expect(sessionSpan.attributes).to.have.property(
      'emb.properties.session-property-wit',
      'session property long value with extra i'
    );

    expect(
      sessionSpan.attributes[
        'emb.app.applied_limit.session_property_key.truncate_string.count'
      ]
    ).to.be.equal(1);

    expect(
      sessionSpan.attributes[
        'emb.app.applied_limit.session_property_value.truncate_string.count'
      ]
    ).to.be.equal(1);

    expect(diag.getWarnLogs()).to.have.lengthOf(2);
    expect(diag.getWarnLogs()[0]).to.equal(
      'truncating session_property_key because it is longer than 20 characters: "session-property-with-long-key"'
    );
    expect(diag.getWarnLogs()[1]).to.equal(
      'truncating session_property_value because it is longer than 40 characters: "session property long value with extra information"'
    );
  });

  it('should store permanent properties in localStorage', () => {
    const propertyKey = 'permanent-key';
    const attributeKey = `${KEY_PREFIX_EMB_PROPERTIES}${propertyKey}`;
    const value = 'permanent-value';

    manager.startSessionSpan();
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });

    let storedAttribute = storage.getItem(attributeKey);
    expect(storedAttribute).to.equal(value);

    manager.endSessionSpan();

    storedAttribute = storage.getItem(attributeKey);
    expect(storedAttribute).to.equal(value);
  });

  it('should not store session properties in localStorage', () => {
    const propertyKey = 'session-only-key';
    const attributeKey = `${KEY_PREFIX_EMB_PROPERTIES}${propertyKey}`;
    const value = 'session-only-value';
    manager.startSessionSpan();
    manager.addProperty(propertyKey, value);

    const storedValue = storage.getItem(attributeKey);
    void expect(storedValue).to.be.null;
  });

  it('should not store permanent properties in localStorage that have been removed', () => {
    const propertyKey = 'permanent-key';
    const attributeKey = `${KEY_PREFIX_EMB_PROPERTIES}${propertyKey}`;
    const value = 'permanent-value';

    manager.startSessionSpan();
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    const storedAttribute = storage.getItem(attributeKey);
    expect(storedAttribute).to.equal(value);
    manager.endSessionSpan();

    manager.startSessionSpan();
    manager.removeProperty(propertyKey);
    const storedAttribute2 = storage.getItem(attributeKey);
    void expect(storedAttribute2).to.be.null;
    manager.endSessionSpan();

    const storedAttribute3 = storage.getItem(attributeKey);
    void expect(storedAttribute3).to.be.null;
  });

  it('should not persist session properties after session end', () => {
    const propertyKey = 'session-only-key';
    const attributeKey = `${KEY_PREFIX_EMB_PROPERTIES}${propertyKey}`;
    const value = 'session-only-value';

    manager.startSessionSpan();
    manager.addProperty(propertyKey, value);
    manager.endSessionSpan();

    manager.startSessionSpan();
    expect(manager.getSessionSpan()?.attributes).to.not.have.property(
      attributeKey,
      value
    );
  });

  it('should persist permanent properties into new sessions', () => {
    const permanentPropertyKey = 'permanent-key';
    const permanentAttributeKey = `${KEY_PREFIX_EMB_PROPERTIES}${permanentPropertyKey}`;
    const permanentValue = 'permanent-value';
    const sessionOnlyPropertyKey = 'session-only-key';
    const sessionOnlyAttributeKey = `${KEY_PREFIX_EMB_PROPERTIES}${sessionOnlyPropertyKey}`;
    const sessionOnlyValue = 'session-only-value';

    manager.startSessionSpan();
    manager.addProperty(sessionOnlyPropertyKey, sessionOnlyValue);
    manager.addProperty(permanentPropertyKey, permanentValue, {
      lifespan: 'permanent',
    });
    manager.endSessionSpan();

    manager.startSessionSpan();
    expect(manager.getSessionSpan()?.attributes).to.not.have.property(
      sessionOnlyAttributeKey,
      sessionOnlyValue
    );
    expect(manager.getSessionSpan()?.attributes).to.have.property(
      permanentAttributeKey,
      permanentValue
    );
  });

  it('should not persist removed permanent properties into new sessions', () => {
    const propertyKey = 'permanent-key';
    const attributeKey = `${KEY_PREFIX_EMB_PROPERTIES}${propertyKey}`;
    const value = 'permanent-value';

    manager.startSessionSpan();
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    manager.endSessionSpan();

    manager.startSessionSpan();
    manager.removeProperty(propertyKey);
    manager.endSessionSpan();

    manager.startSessionSpan();
    expect(manager.getSessionSpan()?.attributes).to.not.have.property(
      attributeKey,
      value
    );
  });

  it('should handle removing permanent properties that have long keys', () => {
    const propertyKey = 'permanent-key-that-is-longer-than-the-character-limit';
    const truncatedKey = 'permanent-key-that-i';
    const attributeKey = `${KEY_PREFIX_EMB_PROPERTIES}${truncatedKey}`;
    const longAttributeKey = `${KEY_PREFIX_EMB_PROPERTIES}${propertyKey}`;
    const value = 'permanent-value';

    manager.startSessionSpan();
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    manager.endSessionSpan();

    manager.startSessionSpan();
    expect(manager.getSessionSpan()?.attributes).to.have.property(
      attributeKey,
      value
    );
    expect(manager.getSessionSpan()?.attributes).to.not.have.property(
      longAttributeKey,
      value
    );
    manager.removeProperty(propertyKey);
    manager.endSessionSpan();

    manager.startSessionSpan();
    expect(manager.getSessionSpan()?.attributes).to.not.have.property(
      attributeKey,
      value
    );
    expect(manager.getSessionSpan()?.attributes).to.not.have.property(
      longAttributeKey,
      value
    );
  });

  it('should have the right internal diagnostic attributes', () => {
    manager.startSessionSpan();
    manager.endSessionSpan();

    let finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    let sessionSpan = finishedSpans[0];
    // First session should have emb.cold_start = true, and number be one.
    expect(sessionSpan.attributes).to.have.property('emb.cold_start', true);
    expect(sessionSpan.attributes).to.have.property('emb.session_number', 1);
    expect(sessionSpan.attributes).not.to.have.property(
      'emb.session_start_type'
    );
    memoryExporter.reset();

    manager.startSessionSpan();
    manager.endSessionSpan();

    finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    sessionSpan = finishedSpans[0];
    // Any following session should have emb.cold_start = false
    expect(sessionSpan.attributes).to.have.property('emb.cold_start', false);
    expect(sessionSpan.attributes).to.have.property('emb.session_number', 2);
    memoryExporter.reset();

    manager.startSessionSpan();
    manager.endSessionSpan();

    finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    sessionSpan = finishedSpans[0];
    // Any following session should have emb.cold_start = false
    expect(sessionSpan.attributes).to.have.property('emb.cold_start', false);
    expect(sessionSpan.attributes).to.have.property('emb.session_number', 3);
    memoryExporter.reset();

    // instantiate a new manager w/ the same storage instance, should get a cold start again but a session number of 4
    manager = new EmbraceSpanSessionManager({ diag, limitManager, storage });

    manager.startSessionSpan();
    manager.endSessionSpan();

    finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    sessionSpan = finishedSpans[0];
    // Any following session should have emb.cold_start = false
    expect(sessionSpan.attributes).to.have.property('emb.cold_start', true);
    expect(sessionSpan.attributes).to.have.property('emb.session_number', 4);
    memoryExporter.reset();
  });

  it('should allow starting a session with a reason', () => {
    manager.startSessionSpan({ reason: 'start reason' });
    manager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_STARTED,
      'start reason'
    );
  });

  it('should default to session number 1 when storage is failing', () => {
    manager = new EmbraceSpanSessionManager({
      diag,
      limitManager,
      storage: new FailingStorage(),
    });

    manager.startSessionSpan();
    manager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property('emb.session_number', 1);

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.include(
      'Error loading permanent session properties'
    );
  });

  it('should allow setting a different trace provider', () => {
    const secondMemoryExporter = new InMemorySpanExporter();
    const tracerProvider = new WebTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(secondMemoryExporter)],
    });

    manager.setTracerProvider(tracerProvider);
    manager.startSessionSpan();
    manager.endSessionSpan();

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    expect(secondMemoryExporter.getFinishedSpans()).to.have.lengthOf(1);
  });

  describe('currentSessionAsReadableSpan', () => {
    it('should return null when no session is active', () => {
      // No session started
      const spanCopy = manager.currentSessionAsReadableSpan('manual');
      expect(spanCopy).to.equal(null);

      const debugLogs = diag.getDebugLogs();
      expect(debugLogs).to.include(
        'trying to end a session, but there is no session in progress. This is a no-op.'
      );
    });

    it('should include all the same attributes as endSessionSpanInternal would add', () => {
      manager.startSessionSpan();
      manager.addProperty('session-prop', 'session-value');
      manager.recordSDKStartupDuration(250);

      // Create copy before ending session
      const sessionSpanNotExported = manager.currentSessionAsReadableSpan(
        'manual'
      ) as unknown as ReadableSpan;
      expect(sessionSpanNotExported).to.not.equal(null);

      // Session manager still has the active session
      expect(manager.getSessionId()).to.not.equal(null);
      expect(manager.getSessionSpan()).to.not.equal(null);

      // End the original session with different reason
      manager.endSessionSpanInternal('timer');

      // Session manager now has no active session
      expect(manager.getSessionId()).to.equal(null);
      expect(manager.getSessionSpan()).to.equal(null);

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);

      const sessionSpan = finishedSpans[0];
      expect(sessionSpan).to.not.equal(undefined);

      // Both should have the same key attributes
      expect(sessionSpanNotExported.attributes).to.have.property(
        KEY_EMB_SESSION_REASON_ENDED,
        'manual'
      );
      expect(sessionSpan.attributes).to.have.property(
        KEY_EMB_SESSION_REASON_ENDED,
        'timer'
      );
      expect(sessionSpanNotExported.attributes).to.have.property(
        'emb.properties.session-prop',
        'session-value'
      );
      expect(sessionSpan.attributes).to.have.property(
        'emb.properties.session-prop',
        'session-value'
      );
      expect(sessionSpanNotExported.attributes).to.have.property(
        'emb.sdk_startup_duration',
        250
      );
      expect(sessionSpan.attributes).to.have.property(
        'emb.sdk_startup_duration',
        250
      );
    });
  });

  describe('Cross-tab tracking', () => {
    let sandbox: SinonSandbox;
    let mockStorage: InMemoryStorage;
    let mockSessionStorage: InMemoryStorage;
    let visibilityDoc: VisibilityStateDocument;
    let mockPerf: MockPerformanceManager;
    let clock: sinon.SinonFakeTimers;
    let originalReferrer: PropertyDescriptor | undefined;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      clock = sandbox.useFakeTimers();
      mockStorage = new InMemoryStorage();
      mockSessionStorage = new InMemoryStorage();
      mockPerf = new MockPerformanceManager(clock);

      // Create visibility doc for testing
      visibilityDoc = {
        visibilityState: 'visible',
      };

      // Store original referrer and mock document.referrer with same origin as current window
      originalReferrer = Object.getOwnPropertyDescriptor(document, 'referrer');
      const currentOrigin = window.location.origin;
      Object.defineProperty(document, 'referrer', {
        value: `${currentOrigin}/previous-page`,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      sandbox.restore();

      // Restore original referrer
      if (originalReferrer) {
        Object.defineProperty(document, 'referrer', originalReferrer);
      }
    });

    describe('Tab initialization', () => {
      it('should create new tab with unique ID when no existing tab data', () => {
        // Create manager - initialization happens in constructor
        new EmbraceSpanSessionManager({
          diag,
          storage: mockStorage,
          sessionStorage: mockSessionStorage,
          limitManager,
          visibilityDoc,
          perf: mockPerf,
        });

        // Check that tab data was stored in sessionStorage
        const storedTab = mockSessionStorage.getItem(EMBRACE_TAB_STORAGE_KEY);
        void expect(storedTab).to.not.be.null;

        const tab = JSON.parse(storedTab ?? '{}') as Tab;
        void expect(tab).to.have.property('tabId');
        expect(tab.tabId).to.be.of.length(32);
        void expect(tab).to.have.property('experienceId');
        expect(tab.experienceId).to.be.of.length(32);
        void expect(tab.parentTabId).to.be.undefined;
      });

      it('should add tab attributes to session span', () => {
        const existingTab = {
          tabId: 'test-tab-123',
          experienceId: 'test-exp-456',
          parentTabId: 'parent-789',
        };

        mockSessionStorage.setItem(
          EMBRACE_TAB_STORAGE_KEY,
          JSON.stringify(existingTab)
        );

        const manager = new EmbraceSpanSessionManager({
          diag,
          storage: mockStorage,
          sessionStorage: mockSessionStorage,
          limitManager,
          visibilityDoc,
          perf: mockPerf,
        });

        manager.startSessionSpan();
        manager.endSessionSpan();

        const finishedSpans = memoryExporter.getFinishedSpans();
        void expect(finishedSpans).to.have.lengthOf(1);
        const sessionSpan = finishedSpans[0];

        void expect(sessionSpan.attributes).to.have.property(
          KEY_EMB_TAB_ID,
          'test-tab-123'
        );
        void expect(sessionSpan.attributes).to.have.property(
          KEY_EMB_EXPERIENCE_ID,
          'test-exp-456'
        );
        void expect(sessionSpan.attributes).to.have.property(
          KEY_EMB_PARENT_TAB_ID,
          'parent-789'
        );
      });
    });

    describe('Parent tab detection', () => {
      it('should detect parent tab when opened from another tab on the same origin', () => {
        const now = clock.now;
        const parentActivity: LastTabActivity = {
          tabId: 'parent-tab-123',
          experienceId: 'parent-exp-456',
          lastActivityMs: now - 5000, // 5 seconds ago (within 20s window)
        };

        mockStorage.setItem(
          EMBRACE_TAB_ACTIVITY_STORAGE_KEY,
          JSON.stringify(parentActivity)
        );

        // Create manager with same-origin referrer
        const currentOrigin = window.location.origin;
        new EmbraceSpanSessionManager({
          diag,
          storage: mockStorage,
          sessionStorage: mockSessionStorage,
          limitManager,
          visibilityDoc,
          perf: mockPerf,
          referrer: `${currentOrigin}/previous-page`,
        });

        const storedTab = mockSessionStorage.getItem(EMBRACE_TAB_STORAGE_KEY);
        const tab = JSON.parse(storedTab ?? '{}') as Tab;

        void expect(tab.parentTabId).to.equal('parent-tab-123');
        void expect(tab.experienceId).to.equal('parent-exp-456');
      });

      it('should not detect parent when activity is older than 20 seconds', () => {
        const now = clock.now;
        const oldActivity: LastTabActivity = {
          tabId: 'old-tab-123',
          experienceId: 'old-exp-456',
          lastActivityMs: now - 25000, // 25 seconds ago (> 20s threshold)
        };

        mockStorage.setItem(
          EMBRACE_TAB_ACTIVITY_STORAGE_KEY,
          JSON.stringify(oldActivity)
        );

        // Create manager with same-origin referrer but old activity
        const currentOrigin = window.location.origin;
        new EmbraceSpanSessionManager({
          diag,
          storage: mockStorage,
          sessionStorage: mockSessionStorage,
          limitManager,
          visibilityDoc,
          perf: mockPerf,
          referrer: `${currentOrigin}/previous-page`,
        });

        const storedTab = mockSessionStorage.getItem(EMBRACE_TAB_STORAGE_KEY);
        const tab = JSON.parse(storedTab ?? '{}') as Tab;

        // Should not link to parent because activity is too old
        void expect(tab.parentTabId).to.be.undefined;
        void expect(tab.experienceId).to.not.equal('old-exp-456');
      });

      it('should not detect parent when referrer is missing', () => {
        // Even if there's recent activity, without a referrer we can't determine parent
        const recentActivity: LastTabActivity = {
          tabId: 'recent-tab-123',
          experienceId: 'recent-exp-456',
          lastActivityMs: Date.now() - 1000, // 1 second ago
        };

        mockStorage.setItem(
          EMBRACE_TAB_ACTIVITY_STORAGE_KEY,
          JSON.stringify(recentActivity)
        );

        // Create manager with empty referrer
        new EmbraceSpanSessionManager({
          diag,
          storage: mockStorage,
          sessionStorage: mockSessionStorage,
          limitManager,
          visibilityDoc,
          perf: mockPerf,
          referrer: '',
        });

        const storedTab = mockSessionStorage.getItem(EMBRACE_TAB_STORAGE_KEY);
        const tab = JSON.parse(storedTab ?? '{}') as Tab;

        // No parent should be detected without a referrer
        void expect(tab.parentTabId).to.be.undefined;
      });
    });

    describe('Activity tracking', () => {
      beforeEach(() => {
        // Create manager with existing tab
        const existingTab = {
          tabId: 'test-tab-123',
          experienceId: 'test-exp-456',
          parentTabId: 'parent-789',
        };

        mockSessionStorage.setItem(
          EMBRACE_TAB_STORAGE_KEY,
          JSON.stringify(existingTab)
        );

        // Create manager and record initial activity
        new EmbraceSpanSessionManager({
          diag,
          storage: mockStorage,
          sessionStorage: mockSessionStorage,
          limitManager,
          visibilityDoc,
          perf: mockPerf,
        });
      });

      it('should track clicks on links with target="_blank"', () => {
        const anchor = document.createElement('a');
        anchor.setAttribute('target', '_blank');

        // Mock closest method
        anchor.closest = sandbox.stub().returns(anchor);

        // Simulate click event
        const mockEvent = new MouseEvent('click');
        Object.defineProperty(mockEvent, 'target', { value: anchor });
        document.dispatchEvent(mockEvent);

        const activity = JSON.parse(
          mockStorage.getItem(EMBRACE_TAB_ACTIVITY_STORAGE_KEY) ?? 'null'
        ) as LastTabActivity | null;
        void expect(activity).to.not.be.null;
        void expect(activity?.tabId).to.equal('test-tab-123');
      });
    });

    describe('Referrer detection', () => {
      it('should not detect parent when referrer is from different origin', () => {
        // Even with recent activity, cross-origin referrer shouldn't link tabs
        const recentActivity: LastTabActivity = {
          tabId: 'recent-tab-123',
          experienceId: 'recent-exp-456',
          lastActivityMs: Date.now() - 1000, // 1 second ago
        };

        mockStorage.setItem(
          EMBRACE_TAB_ACTIVITY_STORAGE_KEY,
          JSON.stringify(recentActivity)
        );

        // Create manager with cross-origin referrer
        new EmbraceSpanSessionManager({
          diag,
          storage: mockStorage,
          sessionStorage: mockSessionStorage,
          limitManager,
          visibilityDoc,
          perf: mockPerf,
          referrer: 'https://different-origin.com/page',
        });

        // Should not detect parent (different origin)
        const tabData = JSON.parse(
          mockSessionStorage.getItem(EMBRACE_TAB_STORAGE_KEY) ?? '{}'
        ) as Tab;

        void expect(tabData.parentTabId).to.be.undefined;
      });
    });

    describe('Error handling', () => {
      it('should handle storage quota exceeded errors', () => {
        const quotaError = new DOMException(
          'Storage quota exceeded',
          'QuotaExceededError'
        );

        // Make storage throw quota error once
        let throwError = true;
        const setItemStub = sandbox.stub(mockStorage, 'setItem');
        setItemStub.callsFake(() => {
          if (throwError) {
            throwError = false;
            throw quotaError;
          }
        });

        const manager = new EmbraceSpanSessionManager({
          diag,
          storage: mockStorage,
          sessionStorage: mockSessionStorage,
          limitManager,
          visibilityDoc,
          perf: mockPerf,
        });

        // Try to record activity (should handle quota error)
        const privateManager = manager as unknown as {
          _recordActivity: () => void;
        };
        privateManager._recordActivity();

        // Check that warning was logged
        const warnings = diag.getWarnLogs();
        void expect(
          warnings.some((w: string) =>
            w.includes('Failed to save last tab activity')
          )
        ).to.be.true;
      });

      it('should handle corrupted JSON in storage gracefully', () => {
        mockStorage.setItem(EMBRACE_TAB_ACTIVITY_STORAGE_KEY, 'invalid-json{');

        // Create manager - initialization happens in constructor
        new EmbraceSpanSessionManager({
          diag,
          storage: mockStorage,
          sessionStorage: mockSessionStorage,
          limitManager,
          visibilityDoc,
          perf: mockPerf,
        });

        // Should not throw and should create new tab
        const storedTab = mockSessionStorage.getItem(EMBRACE_TAB_STORAGE_KEY);
        void expect(storedTab).to.not.be.null;

        const warnings = diag.getWarnLogs();
        void expect(
          warnings.some((w: string) =>
            w.includes('Failed to retrieve last tab activity')
          )
        ).to.be.true;
      });
    });
  });
});
