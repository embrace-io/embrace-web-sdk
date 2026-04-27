import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
  setupTestTraceExporter,
} from '../../../tests/utils/index.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import {
  KEY_EMB_SESSION_REASON_ENDED,
  KEY_EMB_SESSION_REASON_STARTED,
  KEY_PREFIX_EMB_PROPERTIES,
} from '../../constants/attributes.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
} from '../EmbraceLimitManager/index.ts';
import { EmbraceSpanSessionManager } from './EmbraceSpanSessionManager.ts';

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
    void expect(manager.getPreviousSessionId()).to.be.null;
    void expect(manager.getSessionStartTime()).to.be.null;
    manager.startSessionSpan();
    void expect(manager.getSessionSpan()).to.not.be.null;
    void expect(manager.getSessionId()).to.not.be.null;
    void expect(manager.getPreviousSessionId()).to.be.null;
    void expect(manager.getSessionStartTime()).to.not.be.null;
  });

  it('should end the session span', () => {
    void expect(manager.getSessionSpan()).to.be.null;
    void expect(manager.getSessionId()).to.be.null;
    void expect(manager.getPreviousSessionId()).to.be.null;
    void expect(manager.getSessionStartTime()).to.be.null;
    manager.startSessionSpan();
    void expect(manager.getSessionSpan()).to.not.be.null;
    const sessionID = manager.getSessionId();
    void expect(sessionID).to.not.be.null;
    void expect(manager.getPreviousSessionId()).to.be.null;
    void expect(manager.getSessionStartTime()).to.not.be.null;
    manager.endSessionSpan();
    void expect(manager.getSessionSpan()).to.be.null;
    void expect(manager.getSessionId()).to.be.null;
    expect(manager.getPreviousSessionId()).to.equal(sessionID);
    void expect(manager.getSessionStartTime()).to.be.null;
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'manual',
    );
    expect(sessionSpan.attributes).to.have.property(ATTR_SESSION_ID, sessionID);
  });

  it('should end the current session span when starting a new one', () => {
    void expect(manager.getSessionSpan()).to.be.null;
    void expect(manager.getSessionId()).to.be.null;
    void expect(manager.getPreviousSessionId()).to.be.null;
    void expect(manager.getSessionStartTime()).to.be.null;
    manager.startSessionSpan();
    void expect(manager.getSessionSpan()).to.not.be.null;
    const sessionID = manager.getSessionId();
    void expect(sessionID).to.not.be.null;
    void expect(manager.getPreviousSessionId()).to.be.null;
    void expect(manager.getSessionStartTime()).to.not.be.null;
    manager.startSessionSpan();
    void expect(manager.getSessionSpan()).to.not.be.null;
    void expect(manager.getSessionId()).to.not.be.null;
    expect(manager.getPreviousSessionId()).to.equal(sessionID);
    void expect(manager.getSessionStartTime()).to.not.be.null;
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'manual',
    );
    expect(sessionSpan.attributes).to.have.property(ATTR_SESSION_ID, sessionID);
  });

  it('should not end a session if there is no active session', () => {
    manager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(0);
    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'trying to end a session, but there is no session in progress. This is a no-op.',
    );
  });

  it('should not fail if trying to add breadcrumb to non active session', () => {
    manager.addBreadcrumb('some breadcrumb');

    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'trying to add breadcrumb to a session, but there is no session in progress. This is a no-op.',
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
      'some breadcrumb',
    );
  });

  it('should not fail if trying to add properties to non active session', () => {
    manager.addProperty('custom-property-1', 'custom value1');

    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'trying to add properties to a session, but there is no session in progress. This is a no-op.',
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
      'custom value1',
    );
    expect(sessionSpan.attributes).to.have.property(
      'emb.properties.custom-property-2',
      'custom value2',
    );
    expect(sessionSpan.attributes).to.have.property(
      'emb.session_end_type',
      'manual',
    );
    expect(sessionSpan.attributes).to.have.property('emb.type', 'ux.session');
  });

  it('should start a foreground session when the document is visible', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
      hasFocus: () => true,
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
      hasFocus: () => false,
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
    let listenerSessionId: string | null = null;

    const listener = () => {
      listenerSessionId = manager.getSessionId();
    };
    const manager = new EmbraceSpanSessionManager({ limitManager });
    const removeListener = manager.addSessionEndedListener(listener);

    void expect(listenerSessionId).to.be.null;

    manager.startSessionSpan();
    let currentSessionId = manager.getSessionId();
    manager.endSessionSpan();

    void expect(listenerSessionId).to.be.eq(currentSessionId);

    removeListener();
    manager.startSessionSpan();
    currentSessionId = manager.getSessionId();
    manager.endSessionSpan();

    void expect(listenerSessionId).not.to.be.eq(currentSessionId);
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
        'this is a breadcrumb',
      );
    }

    expect(
      sessionSpan.attributes['emb.app.applied_limit.breadcrumb.drop.count'],
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
    manager.startSessionSpan();
    manager.addBreadcrumb('this is a breadcrumb');
    manager.endSessionSpan();
    const nextSessionFinishedSpans = memoryExporter.getFinishedSpans();
    expect(nextSessionFinishedSpans).to.have.lengthOf(1);
    const nextSessionSpan = nextSessionFinishedSpans[0];
    expect(nextSessionSpan.events).to.have.lengthOf(1);
    expect(nextSessionSpan.events[0].name).to.equal('emb-breadcrumb');
    expect(nextSessionSpan.events[0].attributes).to.have.property(
      'message',
      'this is a breadcrumb',
    );
  });

  it('should truncate breadcrumb names', () => {
    manager.startSessionSpan();

    manager.addBreadcrumb('this is a breadcrumb');
    manager.addBreadcrumb(
      'this is a breadcrumb which has a name longer than the allowed maximum length',
    );

    manager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(2);
    expect(sessionSpan.events[0].name).to.equal('emb-breadcrumb');
    expect(sessionSpan.events[0].attributes).to.have.property(
      'message',
      'this is a breadcrumb',
    );
    expect(sessionSpan.events[1].name).to.equal('emb-breadcrumb');
    expect(sessionSpan.events[1].attributes).to.have.property(
      'message',
      'this is a breadcrumb which has a name longer than ',
    );

    expect(
      sessionSpan.attributes[
        'emb.app.applied_limit.breadcrumb.truncate_string.count'
      ],
    ).to.be.equal(1);

    expect(diag.getWarnLogs()).to.have.lengthOf(1);
    expect(diag.getWarnLogs()[0]).to.equal(
      'truncating breadcrumb because it is longer than 50 characters: "this is a breadcrumb which has a name longer than the allowed maximum length"',
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
          i.toString(),
        );
      } else {
        void expect(sessionSpan.attributes).not.to.have.property(prop);
      }
    }

    expect(
      sessionSpan.attributes[
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
    manager.startSessionSpan();
    manager.addProperty('my-new-prop', 'new');
    manager.endSessionSpan();
    const nextSessionFinishedSpans = memoryExporter.getFinishedSpans();
    expect(nextSessionFinishedSpans).to.have.lengthOf(1);
    const nextSessionSpan = nextSessionFinishedSpans[0];
    expect(nextSessionSpan.attributes).to.have.property(
      'emb.properties.my-new-prop',
      'new',
    );
  });

  it('should truncate session property keys and values', () => {
    manager.startSessionSpan();

    manager.addProperty('key1', '1');
    manager.addProperty(
      'session-property-with-long-key',
      'session property long value with extra information',
    );

    manager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];

    expect(sessionSpan.attributes).to.have.property(
      'emb.properties.session-property-wit',
      'session property long value with extra i',
    );

    expect(
      sessionSpan.attributes[
        'emb.app.applied_limit.session_property_key.truncate_string.count'
      ],
    ).to.be.equal(1);

    expect(
      sessionSpan.attributes[
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
      value,
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
      sessionOnlyValue,
    );
    expect(manager.getSessionSpan()?.attributes).to.have.property(
      permanentAttributeKey,
      permanentValue,
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
      value,
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
      value,
    );
    expect(manager.getSessionSpan()?.attributes).to.not.have.property(
      longAttributeKey,
      value,
    );
    manager.removeProperty(propertyKey);
    manager.endSessionSpan();

    manager.startSessionSpan();
    expect(manager.getSessionSpan()?.attributes).to.not.have.property(
      attributeKey,
      value,
    );
    expect(manager.getSessionSpan()?.attributes).to.not.have.property(
      longAttributeKey,
      value,
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
      'emb.session_start_type',
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
      'start reason',
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
      'Error loading permanent session properties',
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
        'trying to end a session, but there is no session in progress. This is a no-op.',
      );
    });

    it('should include all the same attributes as endSessionSpanInternal would add', () => {
      manager.startSessionSpan();
      manager.addProperty('session-prop', 'session-value');
      manager.recordSDKStartupDuration(250);

      // Create copy before ending session
      const sessionSpanNotExported = manager.currentSessionAsReadableSpan(
        'manual',
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
        'manual',
      );
      expect(sessionSpan.attributes).to.have.property(
        KEY_EMB_SESSION_REASON_ENDED,
        'timer',
      );
      expect(sessionSpanNotExported.attributes).to.have.property(
        'emb.properties.session-prop',
        'session-value',
      );
      expect(sessionSpan.attributes).to.have.property(
        'emb.properties.session-prop',
        'session-value',
      );
      expect(sessionSpanNotExported.attributes).to.have.property(
        'emb.sdk_startup_duration',
        250,
      );
      expect(sessionSpan.attributes).to.have.property(
        'emb.sdk_startup_duration',
        250,
      );
    });
  });
});
