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
import { SafeStorage } from '../../utils/SafeStorage/SafeStorage.ts';
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
  let storage: SafeStorage;
  let limitManager: EmbraceLimitManager;

  before(() => {
    memoryExporter = setupTestTraceExporter();
    inMemoryStorage = new InMemoryStorage();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
    storage = new SafeStorage(inMemoryStorage, diag);
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
    });
    inMemoryStorage.clear();
  });

  it('should initialize a EmbraceUserSessionManager', () => {
    expect(manager).to.be.instanceOf(EmbraceUserSessionManager);
  });

  it('should start a session part', () => {
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
    void expect(manager.getSessionPartStartTime()).to.be.null;
    manager.startSessionPart();
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    void expect(manager.getSessionPartId()).to.not.be.null;
    void expect(manager.getSessionPartStartTime()).to.not.be.null;
  });

  it('should end the session part', () => {
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
    void expect(manager.getSessionPartStartTime()).to.be.null;
    manager.startSessionPart();
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    const sessionID = manager.getSessionPartId();
    void expect(sessionID).to.not.be.null;
    void expect(manager.getSessionPartStartTime()).to.not.be.null;
    manager.endSessionPart();
    void expect(manager.getSessionPartSpan()).to.be.null;
    void expect(manager.getSessionPartId()).to.be.null;
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
    void expect(manager.getSessionPartStartTime()).to.be.null;
    manager.startSessionPart();
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    const sessionID = manager.getSessionPartId();
    void expect(sessionID).to.not.be.null;
    void expect(manager.getSessionPartStartTime()).to.not.be.null;
    manager.startSessionPart();
    void expect(manager.getSessionPartSpan()).to.not.be.null;
    void expect(manager.getSessionPartId()).to.not.be.null;
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

  it('should add breadcrumb to session part span', () => {
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

  it('should queue properties added before any part is active and apply them to the next part', () => {
    // Properties are user-session-scoped, not part-scoped. Calling
    // addProperty before the first part starts should buffer the value in
    // the in-memory map and stamp it on the next part span.
    manager.addProperty('queued-property', 'queued-value');
    manager.startSessionPart();
    manager.endSessionPart();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes).to.have.property(
      'emb.properties.queued-property',
      'queued-value',
    );
  });

  it('should add properties to session part span', () => {
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
    const localManager = new EmbraceUserSessionManager({
      visibilityDoc,
      limitManager,
    });
    localManager.startSessionPart();
    localManager.endSessionPart();

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
    const localManager = new EmbraceUserSessionManager({
      visibilityDoc,
      limitManager,
    });
    localManager.startSessionPart();
    void expect(localManager.getSessionPartId()).to.be.null;
    void expect(localManager.getSessionPartSpan()).to.be.null;

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
    const localManager = new EmbraceUserSessionManager({
      visibilityDoc,
      limitManager,
    });
    localManager.startSessionPart();
    void expect(localManager.getSessionPartId()).to.be.null;
    void expect(localManager.getSessionPartSpan()).to.be.null;

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(0);
  });

  it('should call the session start listener when starting a session', () => {
    const listener = sinon.stub();
    const localManager = new EmbraceUserSessionManager({ limitManager });
    const removeListener = localManager.addSessionPartStartedListener(listener);

    void expect(listener.calledOnce).to.be.false;

    localManager.startSessionPart();

    void expect(listener.calledOnce).to.be.true;

    removeListener();
    localManager.startSessionPart();

    void expect(listener.calledOnce).to.be.true;
  });

  it('should call the session ended listener when ending a session', () => {
    let listenerSessionId: string | null = null;
    const localManager = new EmbraceUserSessionManager({ limitManager });

    const listener = () => {
      listenerSessionId = localManager.getSessionPartId();
    };
    const removeListener = localManager.addSessionPartEndedListener(listener);

    void expect(listenerSessionId).to.be.null;

    localManager.startSessionPart();
    let sessionPartId = localManager.getSessionPartId();
    localManager.endSessionPart();

    void expect(listenerSessionId).to.be.eq(sessionPartId);

    removeListener();
    localManager.startSessionPart();
    sessionPartId = localManager.getSessionPartId();
    localManager.endSessionPart();

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

    let storedAttribute = inMemoryStorage.getItem(attributeKey);
    expect(storedAttribute).to.equal(value);

    manager.endSessionPart();

    storedAttribute = inMemoryStorage.getItem(attributeKey);
    expect(storedAttribute).to.equal(value);
  });

  it('should not store session properties in localStorage', () => {
    const propertyKey = 'session-only-key';
    const attributeKey = `emb.properties.${propertyKey}`;
    const value = 'session-only-value';
    manager.startSessionPart();
    manager.addProperty(propertyKey, value);

    const storedValue = inMemoryStorage.getItem(attributeKey);
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
    const storedAttribute = inMemoryStorage.getItem(attributeKey);
    expect(storedAttribute).to.equal(value);
    manager.endSessionPart();

    manager.startSessionPart();
    manager.removeProperty(propertyKey);
    const storedAttribute2 = inMemoryStorage.getItem(attributeKey);
    void expect(storedAttribute2).to.be.null;
    manager.endSessionPart();

    const storedAttribute3 = inMemoryStorage.getItem(attributeKey);
    void expect(storedAttribute3).to.be.null;
  });

  it('should carry both permanent and non-permanent properties across part transitions within the same user session', () => {
    // Non-permanent properties live in an in-memory user-session map that
    // survives part end and applies to the next part. Permanent properties
    // additionally persist via localStorage. Without a user-session
    // boundary, ending the part is a part transition only, so both kinds
    // carry over.
    const sessionOnlyPropertyKey = 'session-only-key';
    const sessionOnlyAttributeKey = `emb.properties.${sessionOnlyPropertyKey}`;
    const sessionOnlyValue = 'session-only-value';
    const permanentPropertyKey = 'permanent-key';
    const permanentAttributeKey = `emb.properties.${permanentPropertyKey}`;
    const permanentValue = 'permanent-value';

    manager.startSessionPart();
    manager.addProperty(sessionOnlyPropertyKey, sessionOnlyValue);
    manager.addProperty(permanentPropertyKey, permanentValue, {
      lifespan: 'permanent',
    });
    manager.endSessionPart();

    manager.startSessionPart();
    expect(manager.getSessionPartSpan()?.attributes).to.have.property(
      sessionOnlyAttributeKey,
      sessionOnlyValue,
    );
    expect(manager.getSessionPartSpan()?.attributes).to.have.property(
      permanentAttributeKey,
      permanentValue,
    );
  });

  it('should clear non-permanent properties at user-session end while preserving permanent ones', () => {
    // endUserSession on the merged manager triggers the isFinal=true branch
    // in endSessionPartInternal, which clears the in-memory user-session
    // property map. Permanent properties (in localStorage) survive the
    // user-session boundary unchanged.
    const sessionOnlyPropertyKey = 'session-only-key';
    const sessionOnlyAttributeKey = `emb.properties.${sessionOnlyPropertyKey}`;
    const permanentPropertyKey = 'permanent-key';
    const permanentAttributeKey = `emb.properties.${permanentPropertyKey}`;

    manager.startSessionPart();
    manager.addProperty(sessionOnlyPropertyKey, 'session-only-value');
    manager.addProperty(permanentPropertyKey, 'permanent-value', {
      lifespan: 'permanent',
    });

    manager.endUserSession();

    void expect(
      manager.getSessionPartSpan()?.attributes[sessionOnlyAttributeKey],
    ).to.be.undefined;
    expect(manager.getSessionPartSpan()?.attributes).to.have.property(
      permanentAttributeKey,
      'permanent-value',
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
    const failingManager = new EmbraceUserSessionManager({
      diag,
      limitManager,
      storage: new SafeStorage(new FailingStorage(), diag),
    });

    failingManager.startSessionPart();
    failingManager.endSessionPart();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);

    // SafeStorage emits a single error on the first failed write and warns
    // on each failed read; the manager keeps recording in-memory.
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('Storage write failed');
  });

  it('should not throw when storage write fails during a permanent property write', () => {
    const failingManager = new EmbraceUserSessionManager({
      diag,
      limitManager,
      storage: new SafeStorage(new FailingStorage(), diag),
    });
    failingManager.startSessionPart();

    expect(() =>
      failingManager.addProperty('flag', 'on', { lifespan: 'permanent' }),
    ).to.not.throw();

    // The wrapper already logged the canonical write-failure error (during
    // construction or part start). The permanent property degrades to
    // user-session scope without a dedicated log.
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('Storage write failed');
  });

  it('should not throw when storage removeItem fails during removeProperty', () => {
    // Storage that succeeds on getItem (so the live property check passes)
    // but throws on removeItem. Inline construction; no shared helper covers
    // this asymmetric failure mode.
    const flakyStorage: Storage = {
      length: 1,
      key: () => 'emb.properties.flag',
      getItem: (k) => (k === 'emb.properties.flag' ? 'on' : null),
      setItem: () => {},
      removeItem: () => {
        throw new Error('quota exhausted on removeItem');
      },
      clear: () => {},
    };
    const flakyManager = new EmbraceUserSessionManager({
      diag,
      limitManager,
      storage: new SafeStorage(flakyStorage, diag),
    });
    flakyManager.startSessionPart();

    expect(() => flakyManager.removeProperty('flag')).to.not.throw();
    expect(
      diag.getWarnLogs().some((m) => m.includes('Failed to remove')),
    ).to.equal(true);
  });

  it('should be a silent no-op when removeProperty is called for a key that was never set', () => {
    manager.startSessionPart();
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
    manager.startSessionPart();
    manager.endSessionPart();

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    expect(secondMemoryExporter.getFinishedSpans()).to.have.lengthOf(1);
  });

  describe('user session attribute integration', () => {
    it('should attach user session attributes to the session part span', () => {
      const exporter = new InMemorySpanExporter();
      const tracerProvider = new WebTracerProvider({
        spanProcessors: [
          new UserSessionSpanProcessor({
            userSessionManager: manager,
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

    it('should restart parts after endUserSession via the rollover flow', () => {
      const localManager = new EmbraceUserSessionManager({
        diag,
        storage,
        limitManager,
        config: { maxDurationSeconds: 3600 },
      });

      localManager.startSessionPart();
      const firstPartId = localManager.getSessionPartId();

      localManager.endUserSession();

      expect(localManager.getSessionPartId()).to.not.equal(firstPartId);
      expect(localManager.getSessionPartId()).to.not.equal(null);
    });

    it('should mark the session part as final when user session terminates', () => {
      manager.startSessionPart();
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
      // The merged manager skips the deadline write when terminationInfo is
      // present, so termination produces only a clear followed by the new
      // session's first write.
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
        storage: new SafeStorage(spyBacking, diag),
        limitManager,
      });

      localManager.startSessionPart();
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
        // Match inactivity to max so only the max-duration timer fires first.
        config: { maxDurationSeconds: 3600, inactivityTimeoutSeconds: 3600 },
      });

      const clock = sinon.useFakeTimers({ now: 0 });
      try {
        localManager.startSessionPart();

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
      } finally {
        clock.restore();
      }
    });

    it('should defer the rollover part start until the tab becomes engaged when max duration fires while hidden', () => {
      // Spec deviation: when max-duration fires while the tab is not
      // engaged, the old user session is ended and storage is cleared, but
      // the rollover part's start is no-op because startSessionPart refuses
      // to begin a part while the tab is hidden / unfocused. The next
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
        const localManager = new EmbraceUserSessionManager({
          diag,
          perf: new MockPerformanceManager(clock),
          storage,
          limitManager,
          visibilityDoc,
          // Match inactivity to max so only the max-duration timer fires first.
          config: { maxDurationSeconds: 3600, inactivityTimeoutSeconds: 3600 },
        });

        localManager.startSessionPart();
        const firstUserSessionId = localManager.getUserSessionId();
        const firstPartId = localManager.getSessionPartId();
        void expect(firstPartId).to.not.be.null;

        // Tab is no longer engaged before the max-duration boundary.
        visibilityState.current = 'hidden';
        visibilityState.focused = false;

        clock.tick(3601 * 1000);

        // Max-duration ended the old part and cleared the user session, but
        // the rollover startSessionPart skipped because the tab is hidden.
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

        // Tab becomes engaged again. The instrumentation would call
        // startSessionPart('visibility_change') in production; simulate that
        // here. A new user session is created.
        visibilityState.current = 'visible';
        visibilityState.focused = true;
        localManager.startSessionPart('visibility_change');

        void expect(localManager.getSessionPartId()).to.not.be.null;
        expect(localManager.getSessionPartId()).to.not.equal(firstPartId);
        expect(localManager.getUserSessionId()).to.not.equal(
          firstUserSessionId,
        );
      } finally {
        clock.restore();
      }
    });

    it('should detect inactivity expiry lazily on the next part start and roll a new user session', () => {
      // Spec 1.1: inactivity expiry is detected only when a new foreground
      // part begins. The web SDK does not keep a JS timer for inactivity, so
      // the previous part's span is already exported (without is_final) and
      // the next part starts fresh.
      const clock = sinon.useFakeTimers({ now: 0 });
      try {
        const localManager = new EmbraceUserSessionManager({
          diag,
          perf: new MockPerformanceManager(clock),
          storage,
          limitManager,
          config: { inactivityTimeoutSeconds: 60 },
        });

        localManager.startSessionPart();
        const firstUserSessionId = localManager.getUserSessionId();
        localManager.endSessionPart();

        clock.tick(61 * 1000);

        localManager.startSessionPart();
        const secondUserSessionId = localManager.getUserSessionId();

        expect(secondUserSessionId).to.not.equal(firstUserSessionId);
      } finally {
        clock.restore();
      }
    });

    it('should keep the same user session id across consecutive parts within inactivity timeout', () => {
      manager.startSessionPart();
      const firstUserSessionId = manager.getUserSessionId();
      manager.endSessionPart();

      manager.startSessionPart();
      const secondUserSessionId = manager.getUserSessionId();

      expect(secondUserSessionId).to.equal(firstUserSessionId);
    });

    it('should propagate a setSessionId override to the part span session.id without touching emb.user_session_id', () => {
      const exporter = new InMemorySpanExporter();
      const tracerProvider = new WebTracerProvider({
        spanProcessors: [
          new UserSessionSpanProcessor({
            userSessionManager: manager,
          }),
          new SimpleSpanProcessor(exporter),
        ],
      });
      manager.setTracerProvider(tracerProvider);

      manager.setSessionId('customer-provided-id');

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

    it('should stamp emb.user_session_previous_id on a part span created during a user-session rollover', () => {
      const exporter = new InMemorySpanExporter();
      const tracerProvider = new WebTracerProvider({
        spanProcessors: [
          new UserSessionSpanProcessor({
            userSessionManager: manager,
          }),
          new SimpleSpanProcessor(exporter),
        ],
      });
      manager.setTracerProvider(tracerProvider);

      manager.startSessionPart();
      const firstUserSessionId = manager.getUserSessionId();
      void expect(firstUserSessionId).to.not.be.null;

      // Triggers endUserSession -> rollover -> a fresh user session and a
      // brand new part span. The new part span must carry the previous user
      // session's id on emb.user_session_previous_id.
      manager.endUserSession();
      manager.endSessionPart();

      const finishedSpans = exporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      const rolloverPartSpan = finishedSpans[1];
      expect(rolloverPartSpan.attributes).to.have.property(
        'emb.user_session_previous_id',
        firstUserSessionId,
      );
      expect(rolloverPartSpan.attributes).to.have.property(
        'session.previous_id',
        firstUserSessionId,
      );
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
      manager.startSessionPart();
      // Triggers the rollover path inside endUserSession, which restarts a
      // part with reason 'user_session_rollover'.
      manager.endUserSession();
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
      const localManager = new EmbraceUserSessionManager({
        diag,
        storage,
        limitManager,
        config: { maxDurationSeconds: 3600, inactivityTimeoutSeconds: 3600 },
      });

      const clock = sinon.useFakeTimers({ now: 0 });
      try {
        localManager.startSessionPart();

        clock.tick(3601 * 1000);

        localManager.endSessionPart();

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
      manager.startSessionPart();
      manager.endUserSession();
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
        const localManager = new EmbraceUserSessionManager({
          diag,
          perf: new MockPerformanceManager(clock),
          storage,
          limitManager,
          config: { inactivityTimeoutSeconds: 60 },
        });

        localManager.startSessionPart();
        localManager.endSessionPart();

        // End-of-part writes an inactivity deadline to its dedicated key
        // (kept out of the state row so part-end can't clobber a peer's pn).
        const deadlineAfterEnd = inMemoryStorage.getItem(
          'embrace_user_session_inactivity_deadline',
        );
        void expect(deadlineAfterEnd).to.not.be.null;
        expect(Number.parseFloat(deadlineAfterEnd as string)).to.be.a('number');

        clock.tick(1000);

        // A continuing part (still within the inactivity window) must clear
        // the deadline so a future part-start doesn't read a stale value.
        localManager.startSessionPart();

        void expect(
          inMemoryStorage.getItem('embrace_user_session_inactivity_deadline'),
        ).to.be.null;
      } finally {
        clock.restore();
      }
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

      manager.startSessionPart();
      manager.endSessionPart();

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

      manager.startSessionPart();
      void expect(manager.getSessionPartSpan()).to.not.be.null;

      expect(() => manager.endSessionPart()).to.not.throw();

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

      const secondManager = new EmbraceUserSessionManager({
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
