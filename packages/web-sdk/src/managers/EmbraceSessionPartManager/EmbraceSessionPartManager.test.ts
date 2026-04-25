import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
  MockPerformanceManager,
  setupTestTraceExporter,
} from '../../../tests/utils/index.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import { UserSessionSpanProcessor } from '../../processors/UserSessionSpanProcessor/UserSessionSpanProcessor.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
} from '../EmbraceLimitManager/index.ts';
import { EmbraceUserSessionManager } from '../EmbraceUserSessionManager/EmbraceUserSessionManager.ts';
import { EmbraceSessionPartManager } from './EmbraceSessionPartManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceSessionPartManager', () => {
  let manager: EmbraceSessionPartManager;
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

    manager = new EmbraceSessionPartManager({
      diag,
      storage,
      limitManager,
    });
    storage.clear();
  });

  it('should initialize a EmbraceSessionPartManager', () => {
    expect(manager).to.be.instanceOf(EmbraceSessionPartManager);
  });

  it('should start a session part', () => {
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
    void expect(manager.getPreviousSessionPartId()).to.be.null;
    void expect(manager.getSessionPartStartTime()).to.be.null;
    manager.startSessionPart();
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    void expect(manager.getSessionPartId()).to.not.be.null;
    void expect(manager.getPreviousSessionPartId()).to.be.null;
    void expect(manager.getSessionPartStartTime()).to.not.be.null;
  });

  it('should end the session part', () => {
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
    void expect(manager.getPreviousSessionPartId()).to.be.null;
    void expect(manager.getSessionPartStartTime()).to.be.null;
    manager.startSessionPart();
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    const sessionID = manager.getSessionPartId();
    void expect(sessionID).to.not.be.null;
    void expect(manager.getPreviousSessionPartId()).to.be.null;
    void expect(manager.getSessionPartStartTime()).to.not.be.null;
    manager.endSessionPart();
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
    expect(manager.getPreviousSessionPartId()).to.equal(sessionID);
    void expect(manager.getSessionPartStartTime()).to.be.null;
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.session_part_end_reason',
      'manual',
    );
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.session_part_id',
      sessionID,
    );
  });

  it('should end the session part when starting a new one', () => {
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
    void expect(manager.getPreviousSessionPartId()).to.be.null;
    void expect(manager.getSessionPartStartTime()).to.be.null;
    manager.startSessionPart();
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    const sessionID = manager.getSessionPartId();
    void expect(sessionID).to.not.be.null;
    void expect(manager.getPreviousSessionPartId()).to.be.null;
    void expect(manager.getSessionPartStartTime()).to.not.be.null;
    manager.startSessionPart();
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    void expect(manager.getSessionPartId()).to.not.be.null;
    expect(manager.getPreviousSessionPartId()).to.equal(sessionID);
    void expect(manager.getSessionPartStartTime()).to.not.be.null;
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionPartSpan = finishedSpans[0];
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.session_part_end_reason',
      'manual',
    );
    expect(sessionPartSpan.attributes).to.have.property(
      'emb.session_part_id',
      sessionID,
    );
  });

  it('should not end a session if there is no active session', () => {
    manager.endSessionPart();
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

  it('should add breadcrumb to session span', () => {
    manager.startSessionPart();
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    void expect(manager.getSessionPartId()).to.not.be.null;
    void expect(manager.getSessionPartStartTime()).to.not.be.null;

    manager.addBreadcrumb('some breadcrumb');
    manager.endSessionPart();

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

  it('should not fail if trying to add properties to non active session', () => {
    manager.addProperty('custom-property-1', 'custom value1');

    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'trying to add properties, but there is no session part in progress. This is a no-op.',
    );
  });

  it('should add properties to session span', () => {
    manager.startSessionPart();

    manager.addProperty('custom-property-1', 'custom value1');
    manager.addProperty('custom-property-2', 'custom value2');
    manager.endSessionPart();

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
      'manual',
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
    const manager = new EmbraceSessionPartManager({
      visibilityDoc,
      limitManager,
    });
    manager.startSessionPart();
    manager.endSessionPart();

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
      hasFocus: () => false,
    };
    const manager = new EmbraceSessionPartManager({
      visibilityDoc,
      limitManager,
    });
    manager.startSessionPart();
    void expect(manager.getSessionPartId()).to.be.null;
    void expect(manager.getSessionPartSpan()).to.be.null;

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(0);
  });

  it('should skip starting a session part when the document is visible but unfocused', () => {
    // Multi-monitor / DevTools-undocked case: tab is on-screen but another
    // window has focus. Engagement gate must close on `!hasFocus()` alone.
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
      hasFocus: () => false,
    };
    const manager = new EmbraceSessionPartManager({
      visibilityDoc,
      limitManager,
    });
    manager.startSessionPart();
    void expect(manager.getSessionPartId()).to.be.null;
    void expect(manager.getSessionPartSpan()).to.be.null;

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(0);
  });

  it('should call the session start listener when starting a session', () => {
    const listener = sinon.stub();
    const manager = new EmbraceSessionPartManager({ limitManager });
    const removeListener = manager.addSessionPartStartedListener(listener);

    void expect(listener.calledOnce).to.be.false;

    manager.startSessionPart();

    void expect(listener.calledOnce).to.be.true;

    removeListener();
    manager.startSessionPart();

    void expect(listener.calledOnce).to.be.true;
  });

  it('should call the session ended listener when ending a session', () => {
    let listenerSessionId: string | null = null;

    const listener = () => {
      listenerSessionId = manager.getSessionPartId();
    };
    const manager = new EmbraceSessionPartManager({ limitManager });
    const removeListener = manager.addSessionPartEndedListener(listener);

    void expect(listenerSessionId).to.be.null;

    manager.startSessionPart();
    let sessionPartId = manager.getSessionPartId();
    manager.endSessionPart();

    void expect(listenerSessionId).to.be.eq(sessionPartId);

    removeListener();
    manager.startSessionPart();
    sessionPartId = manager.getSessionPartId();
    manager.endSessionPart();

    void expect(listenerSessionId).not.to.be.eq(sessionPartId);
  });

  it('should limit the amount of breadcrumbs per session', () => {
    manager.startSessionPart();

    for (let i = 0; i < 10; i++) {
      manager.addBreadcrumb('this is a breadcrumb');
    }

    manager.endSessionPart();
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
    manager.startSessionPart();
    manager.addBreadcrumb('this is a breadcrumb');
    manager.endSessionPart();
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
    manager.startSessionPart();

    manager.addBreadcrumb('this is a breadcrumb');
    manager.addBreadcrumb(
      'this is a breadcrumb which has a name longer than the allowed maximum length',
    );

    manager.endSessionPart();
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
    manager.startSessionPart();

    for (let i = 0; i < 10; i++) {
      manager.addProperty(`property${i.toString()}`, i.toString());
    }

    manager.endSessionPart();
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
    manager.startSessionPart();
    manager.addProperty('my-new-prop', 'new');
    manager.endSessionPart();
    const nextSessionFinishedSpans = memoryExporter.getFinishedSpans();
    expect(nextSessionFinishedSpans).to.have.lengthOf(1);
    const nextSessionPartSpan = nextSessionFinishedSpans[0];
    expect(nextSessionPartSpan.attributes).to.have.property(
      'emb.properties.my-new-prop',
      'new',
    );
  });

  it('should truncate session property keys and values', () => {
    manager.startSessionPart();

    manager.addProperty('key1', '1');
    manager.addProperty(
      'session-property-with-long-key',
      'session property long value with extra information',
    );

    manager.endSessionPart();
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

  it('should store permanent properties in localStorage', () => {
    const propertyKey = 'permanent-key';
    const attributeKey = `emb.properties.${propertyKey}`;
    const value = 'permanent-value';

    manager.startSessionPart();
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });

    let storedAttribute = storage.getItem(attributeKey);
    expect(storedAttribute).to.equal(value);

    manager.endSessionPart();

    storedAttribute = storage.getItem(attributeKey);
    expect(storedAttribute).to.equal(value);
  });

  it('should not store session properties in localStorage', () => {
    const propertyKey = 'session-only-key';
    const attributeKey = `emb.properties.${propertyKey}`;
    const value = 'session-only-value';
    manager.startSessionPart();
    manager.addProperty(propertyKey, value);

    const storedValue = storage.getItem(attributeKey);
    void expect(storedValue).to.be.null;
  });

  it('should not store permanent properties in localStorage that have been removed', () => {
    const propertyKey = 'permanent-key';
    const attributeKey = `emb.properties.${propertyKey}`;
    const value = 'permanent-value';

    manager.startSessionPart();
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    const storedAttribute = storage.getItem(attributeKey);
    expect(storedAttribute).to.equal(value);
    manager.endSessionPart();

    manager.startSessionPart();
    manager.removeProperty(propertyKey);
    const storedAttribute2 = storage.getItem(attributeKey);
    void expect(storedAttribute2).to.be.null;
    manager.endSessionPart();

    const storedAttribute3 = storage.getItem(attributeKey);
    void expect(storedAttribute3).to.be.null;
  });

  it('should not persist session properties after session end', () => {
    const propertyKey = 'session-only-key';
    const attributeKey = `emb.properties.${propertyKey}`;
    const value = 'session-only-value';

    manager.startSessionPart();
    manager.addProperty(propertyKey, value);
    manager.endSessionPart();

    manager.startSessionPart();
    expect(manager.getSessionPartSpan()?.attributes).to.not.have.property(
      attributeKey,
      value,
    );
  });

  it('should persist permanent properties into new sessions', () => {
    const permanentPropertyKey = 'permanent-key';
    const permanentAttributeKey = `emb.properties.${permanentPropertyKey}`;
    const permanentValue = 'permanent-value';
    const sessionOnlyPropertyKey = 'session-only-key';
    const sessionOnlyAttributeKey = `emb.properties.${sessionOnlyPropertyKey}`;
    const sessionOnlyValue = 'session-only-value';

    manager.startSessionPart();
    manager.addProperty(sessionOnlyPropertyKey, sessionOnlyValue);
    manager.addProperty(permanentPropertyKey, permanentValue, {
      lifespan: 'permanent',
    });
    manager.endSessionPart();

    manager.startSessionPart();
    expect(manager.getSessionPartSpan()?.attributes).to.not.have.property(
      sessionOnlyAttributeKey,
      sessionOnlyValue,
    );
    expect(manager.getSessionPartSpan()?.attributes).to.have.property(
      permanentAttributeKey,
      permanentValue,
    );
  });

  it('should not persist removed permanent properties into new sessions', () => {
    const propertyKey = 'permanent-key';
    const attributeKey = `emb.properties.${propertyKey}`;
    const value = 'permanent-value';

    manager.startSessionPart();
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    manager.endSessionPart();

    manager.startSessionPart();
    manager.removeProperty(propertyKey);
    manager.endSessionPart();

    manager.startSessionPart();
    expect(manager.getSessionPartSpan()?.attributes).to.not.have.property(
      attributeKey,
      value,
    );
  });

  it('should handle removing permanent properties that have long keys', () => {
    const propertyKey = 'permanent-key-that-is-longer-than-the-character-limit';
    const truncatedKey = 'permanent-key-that-i';
    const attributeKey = `emb.properties.${truncatedKey}`;
    const longAttributeKey = `emb.properties.${propertyKey}`;
    const value = 'permanent-value';

    manager.startSessionPart();
    manager.addProperty(propertyKey, value, {
      lifespan: 'permanent',
    });
    manager.endSessionPart();

    manager.startSessionPart();
    expect(manager.getSessionPartSpan()?.attributes).to.have.property(
      attributeKey,
      value,
    );
    expect(manager.getSessionPartSpan()?.attributes).to.not.have.property(
      longAttributeKey,
      value,
    );
    manager.removeProperty(propertyKey);
    manager.endSessionPart();

    manager.startSessionPart();
    expect(manager.getSessionPartSpan()?.attributes).to.not.have.property(
      attributeKey,
      value,
    );
    expect(manager.getSessionPartSpan()?.attributes).to.not.have.property(
      longAttributeKey,
      value,
    );
  });

  it('should still emit a session part span when storage is failing', () => {
    manager = new EmbraceSessionPartManager({
      diag,
      limitManager,
      storage: new FailingStorage(),
    });

    manager.startSessionPart();
    manager.endSessionPart();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.include(
      'Error loading permanent session part properties',
    );
  });

  it('should allow setting a different trace provider', () => {
    const secondMemoryExporter = new InMemorySpanExporter();
    const tracerProvider = new WebTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(secondMemoryExporter)],
    });

    manager.setTracerProvider(tracerProvider);
    manager.startSessionPart();
    manager.endSessionPart();

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    expect(secondMemoryExporter.getFinishedSpans()).to.have.lengthOf(1);
  });

  describe('user session manager integration', () => {
    it('should attach user session attributes to the session part span', () => {
      const userSessionManager = new EmbraceUserSessionManager({
        diag,
        storage,
      });
      manager = new EmbraceSessionPartManager({
        diag,
        storage,
        limitManager,
        userSessionManager,
      });
      const exporter = new InMemorySpanExporter();
      const tracerProvider = new WebTracerProvider({
        spanProcessors: [
          new UserSessionSpanProcessor({
            userSessionManager,
            sessionPartManager: manager,
          }),
          new SimpleSpanProcessor(exporter),
        ],
      });
      manager.setTracerProvider(tracerProvider);

      manager.startSessionPart();
      manager.endSessionPart();

      const finishedSpans = exporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      const sessionPartSpan = finishedSpans[0];
      expect(sessionPartSpan.attributes)
        .to.have.property('emb.user_session_id')
        .that.is.a('string');
      expect(sessionPartSpan.attributes).to.have.property('session.id');
      expect(sessionPartSpan.attributes['session.id']).to.equal(
        sessionPartSpan.attributes['emb.user_session_id'],
      );
      expect(sessionPartSpan.attributes).to.have.property(
        'emb.user_session_number',
        1,
      );
      expect(sessionPartSpan.attributes).to.have.property(
        'emb.user_session_part_number',
        1,
      );
    });

    it('should wire startPart/endPart callbacks so user session manager can restart parts', () => {
      const userSessionManager = new EmbraceUserSessionManager({
        diag,
        storage,
        config: { maxDurationSeconds: 3600 },
      });
      manager = new EmbraceSessionPartManager({
        diag,
        storage,
        limitManager,
        userSessionManager,
      });

      manager.startSessionPart();
      const firstPartId = manager.getSessionPartId();

      userSessionManager.endUserSession();

      expect(manager.getSessionPartId()).to.not.equal(firstPartId);
      expect(manager.getSessionPartId()).to.not.equal(null);
    });

    it('should mark the session part as final when user session terminates', () => {
      const userSessionManager = new EmbraceUserSessionManager({
        diag,
        storage,
      });
      manager = new EmbraceSessionPartManager({
        diag,
        storage,
        limitManager,
        userSessionManager,
      });

      manager.startSessionPart();
      userSessionManager.endUserSession();

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
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
      // Regression: termination used to flow through onSessionPartEnd, which
      // wrote a fresh inactivity deadline to storage right before _clearStoredState
      // removed it. Peer tabs saw three storage events: a stale sync, a clear,
      // and the new session's first write. Now the part manager skips
      // onSessionPartEnd when terminationInfo.isFinal is true, so termination
      // produces only the clear followed by the new session's first write.
      const stateOps: Array<'set' | 'remove'> = [];
      const spyStorage = new InMemoryStorage();
      const originalSet = spyStorage.setItem.bind(spyStorage);
      const originalRemove = spyStorage.removeItem.bind(spyStorage);
      spyStorage.setItem = (key, value) => {
        if (key === 'embrace_user_session_state') {
          stateOps.push('set');
        }
        originalSet(key, value);
      };
      spyStorage.removeItem = (key) => {
        if (key === 'embrace_user_session_state') {
          stateOps.push('remove');
        }
        originalRemove(key);
      };

      const userSessionManager = new EmbraceUserSessionManager({
        diag,
        storage: spyStorage,
      });
      manager = new EmbraceSessionPartManager({
        diag,
        storage: spyStorage,
        limitManager,
        userSessionManager,
      });

      manager.startSessionPart();
      stateOps.length = 0;

      userSessionManager.endUserSession();

      // Exactly two storage ops: remove (clear the dying session), then set
      // (start the rollover session). No intermediate set with a stale
      // continuation snapshot.
      expect(stateOps).to.deep.equal(['remove', 'set']);
    });

    it('should mark part as final when max duration timer fires during active part', () => {
      const userSessionManager = new EmbraceUserSessionManager({
        diag,
        storage,
        // Match inactivity to max so only the max-duration timer fires first.
        config: { maxDurationSeconds: 3600, inactivityTimeoutSeconds: 3600 },
      });
      manager = new EmbraceSessionPartManager({
        diag,
        storage,
        limitManager,
        userSessionManager,
      });

      const clock = sinon.useFakeTimers({ now: 0 });
      try {
        manager.startSessionPart();

        clock.tick(3601 * 1000);

        const finishedSpans = memoryExporter.getFinishedSpans();
        expect(finishedSpans).to.have.lengthOf(1);
        const endedSpan = finishedSpans[0];
        expect(endedSpan.attributes).to.have.property(
          'emb.is_final_session_part',
          1,
        );
        expect(endedSpan.attributes).to.have.property(
          'emb.user_session_termination_reason',
          'max_duration_reached',
        );
      } finally {
        clock.restore();
      }
    });

    it('should defer the rollover part start until the tab becomes engaged when max duration fires while hidden', () => {
      // PR description spec deviation: when max-duration fires while the tab
      // is not engaged, the old user session is ended and storage is cleared,
      // but the rollover part's start is no-op because startSessionPart
      // refuses to begin a part while the tab is hidden / unfocused. The next
      // engagement event (handled by SessionPartActivityInstrumentation in
      // production) is what actually starts the new part.
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

      const clock = sinon.useFakeTimers({ now: 0 });
      try {
        const userSessionManager = new EmbraceUserSessionManager({
          diag,
          perf: new MockPerformanceManager(clock),
          storage,
          // Match inactivity to max so only the max-duration timer fires first.
          config: { maxDurationSeconds: 3600, inactivityTimeoutSeconds: 3600 },
        });
        manager = new EmbraceSessionPartManager({
          diag,
          storage,
          limitManager,
          userSessionManager,
          visibilityDoc,
        });

        manager.startSessionPart();
        const firstUserSessionId = userSessionManager.getUserSessionId();
        const firstPartId = manager.getSessionPartId();
        void expect(firstPartId).to.not.be.null;

        // Tab is no longer engaged before the max-duration boundary.
        visibilityState.current = 'hidden';
        visibilityState.focused = false;

        clock.tick(3601 * 1000);

        // Max-duration ended the old part and cleared the user session, but
        // the rollover startSessionPart skipped because the tab is hidden.
        void expect(manager.getSessionPartSpan()).to.be.null;
        void expect(manager.getSessionPartId()).to.be.null;
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

        // Tab becomes engaged again. The instrumentation would call
        // startSessionPart('visibility_change') in production; simulate that
        // here. A new user session is created.
        visibilityState.current = 'visible';
        visibilityState.focused = true;
        manager.startSessionPart('visibility_change');

        void expect(manager.getSessionPartId()).to.not.be.null;
        expect(manager.getSessionPartId()).to.not.equal(firstPartId);
        expect(userSessionManager.getUserSessionId()).to.not.equal(
          firstUserSessionId,
        );
      } finally {
        clock.restore();
      }
    });

    it('should detect inactivity expiry lazily on the next part start and roll a new user session', () => {
      // Spec §1.1: inactivity expiry is detected only when a new foreground
      // part begins. The web SDK does not keep a JS timer for inactivity, so
      // the previous part's span is already exported (without is_final) and
      // the next part starts fresh.
      const clock = sinon.useFakeTimers({ now: 0 });
      try {
        const userSessionManager = new EmbraceUserSessionManager({
          diag,
          perf: new MockPerformanceManager(clock),
          storage,
          config: { inactivityTimeoutSeconds: 60 },
        });
        manager = new EmbraceSessionPartManager({
          diag,
          storage,
          limitManager,
          userSessionManager,
        });

        manager.startSessionPart();
        const firstUserSessionId = userSessionManager.getUserSessionId();
        manager.endSessionPart();

        clock.tick(61 * 1000);

        manager.startSessionPart();
        const secondUserSessionId = userSessionManager.getUserSessionId();

        expect(secondUserSessionId).to.not.equal(firstUserSessionId);
      } finally {
        clock.restore();
      }
    });

    it('should keep the same user session id across consecutive parts within inactivity timeout', () => {
      const userSessionManager = new EmbraceUserSessionManager({
        diag,
        storage,
      });
      manager = new EmbraceSessionPartManager({
        diag,
        storage,
        limitManager,
        userSessionManager,
      });

      manager.startSessionPart();
      const firstUserSessionId = userSessionManager.getUserSessionId();
      manager.endSessionPart();

      manager.startSessionPart();
      const secondUserSessionId = userSessionManager.getUserSessionId();

      expect(secondUserSessionId).to.equal(firstUserSessionId);
    });

    it('should propagate a setSessionId override to the part span session.id without touching emb.user_session_id', () => {
      const userSessionManager = new EmbraceUserSessionManager({
        diag,
        storage,
      });
      manager = new EmbraceSessionPartManager({
        diag,
        storage,
        limitManager,
        userSessionManager,
      });
      const exporter = new InMemorySpanExporter();
      const tracerProvider = new WebTracerProvider({
        spanProcessors: [
          new UserSessionSpanProcessor({
            userSessionManager,
            sessionPartManager: manager,
          }),
          new SimpleSpanProcessor(exporter),
        ],
      });
      manager.setTracerProvider(tracerProvider);

      userSessionManager.setSessionId('customer-provided-id');

      manager.startSessionPart();
      manager.endSessionPart();

      const finishedSpans = exporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      const sessionPartSpan = finishedSpans[0];
      expect(sessionPartSpan.attributes).to.have.property(
        'session.id',
        'customer-provided-id',
      );
      const userSessionId = sessionPartSpan.attributes['emb.user_session_id'];
      expect(userSessionId).to.be.a('string');
      expect(userSessionId).to.not.equal('customer-provided-id');
    });
  });

  describe('emb.session_part_start_reason', () => {
    it('should default to "init" on the part span when no reason is passed', () => {
      manager.startSessionPart();
      manager.endSessionPart();

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_start_reason',
        'init',
      );
    });

    it('should stamp "activity" on the part span when started with that reason', () => {
      manager.startSessionPart('activity');
      manager.endSessionPart();

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_start_reason',
        'activity',
      );
    });

    it('should stamp "user_session_rollover" on the part span started by user-session rollover', () => {
      const userSessionManager = new EmbraceUserSessionManager({
        diag,
        storage,
      });
      manager = new EmbraceSessionPartManager({
        diag,
        storage,
        limitManager,
        userSessionManager,
      });

      manager.startSessionPart();
      // Triggers the endSessionPart + startSessionPart callbacks on the
      // part manager, which should pass 'user_session_rollover'.
      userSessionManager.endUserSession();
      manager.endSessionPart();

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
      const userSessionManager = new EmbraceUserSessionManager({
        diag,
        storage,
        config: { maxDurationSeconds: 3600, inactivityTimeoutSeconds: 3600 },
      });
      manager = new EmbraceSessionPartManager({
        diag,
        storage,
        limitManager,
        userSessionManager,
      });

      const clock = sinon.useFakeTimers({ now: 0 });
      try {
        manager.startSessionPart();

        clock.tick(3601 * 1000);

        manager.endSessionPart();

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
      } finally {
        clock.restore();
      }
    });
  });

  describe('emb.session_part_end_reason', () => {
    it('should stamp "visibility_change" when the part ends on visibility hidden', () => {
      manager.startSessionPart();
      manager.endSessionPartInternal('visibility_change');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_end_reason',
        'visibility_change',
      );
    });

    it('should stamp "inactivity" when the part-inactivity timer ends the part', () => {
      manager.startSessionPart();
      manager.endSessionPartInternal('inactivity');

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_end_reason',
        'inactivity',
      );
    });

    it('should stamp "user_session_ended" when the user-session manager ends the part on rollover', () => {
      const userSessionManager = new EmbraceUserSessionManager({
        diag,
        storage,
      });
      manager = new EmbraceSessionPartManager({
        diag,
        storage,
        limitManager,
        userSessionManager,
      });

      manager.startSessionPart();
      userSessionManager.endUserSession();
      manager.endSessionPart();

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.session_part_end_reason',
        'user_session_ended',
      );
      expect(finishedSpans[1].attributes).to.have.property(
        'emb.session_part_end_reason',
        'manual',
      );
    });
  });

  describe('removed attributes', () => {
    it('should not emit emb.session_part_number on the part span', () => {
      const userSessionManager = new EmbraceUserSessionManager({
        diag,
        storage,
      });
      manager = new EmbraceSessionPartManager({
        diag,
        storage,
        limitManager,
        userSessionManager,
      });

      manager.startSessionPart();
      manager.endSessionPart();

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.not.have.property(
        'emb.session_part_number',
      );
    });
  });

  describe('continuation inactivity handling', () => {
    it('should clear the persisted inactivity deadline when a part continues an active user session', () => {
      const clock = sinon.useFakeTimers({ now: 0 });
      try {
        const userSessionManager = new EmbraceUserSessionManager({
          diag,
          perf: new MockPerformanceManager(clock),
          storage,
          config: { inactivityTimeoutSeconds: 60 },
        });
        manager = new EmbraceSessionPartManager({
          diag,
          storage,
          limitManager,
          userSessionManager,
        });

        manager.startSessionPart();
        manager.endSessionPart();

        // End-of-part writes an inactivity deadline.
        const persistedAfterEnd = JSON.parse(
          storage.getItem('embrace_user_session_state') ?? '{}',
        ) as { inactivityDeadlineTs: number | null };
        expect(persistedAfterEnd.inactivityDeadlineTs).to.be.a('number');

        clock.tick(1000);

        // A continuing part (still within the inactivity window) must null out
        // the deadline so a future part-start doesn't read a stale value.
        manager.startSessionPart();

        const persistedAfterContinue = JSON.parse(
          storage.getItem('embrace_user_session_state') ?? '{}',
        ) as { inactivityDeadlineTs: number | null };
        void expect(persistedAfterContinue.inactivityDeadlineTs).to.be.null;
      } finally {
        clock.restore();
      }
    });
  });

  describe('emb.cold_start', () => {
    it('should stamp true on the first part and false on subsequent parts from the same manager', () => {
      manager.startSessionPart();
      manager.endSessionPart();
      manager.startSessionPart();
      manager.endSessionPart();
      manager.startSessionPart();
      manager.endSessionPart();

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
      manager.startSessionPart();
      manager.endSessionPart();

      const secondManager = new EmbraceSessionPartManager({
        diag,
        storage,
        limitManager,
      });
      secondManager.startSessionPart();
      secondManager.endSessionPart();

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
});
