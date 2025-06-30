import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { VisibilityStateDocument } from '../../common/index.js';
import {
  KEY_EMB_SESSION_REASON_ENDED,
  KEY_PREFIX_EMB_PROPERTIES,
} from '../../constants/attributes.js';
import {
  InMemoryDiagLogger,
  InMemoryStorage,
  setupTestTraceExporter,
} from '../../testUtils/index.js';
import { EmbraceSpanSessionManager } from './EmbraceSpanSessionManager.js';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceSpanSessionManager', () => {
  let manager: EmbraceSpanSessionManager;
  let memoryExporter: InMemorySpanExporter;
  let diag: InMemoryDiagLogger;
  let storage: InMemoryStorage;

  before(() => {
    memoryExporter = setupTestTraceExporter();
    storage = new InMemoryStorage();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
    manager = new EmbraceSpanSessionManager({ diag, storage });
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
    const manager = new EmbraceSpanSessionManager({ visibilityDoc });
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
    const manager = new EmbraceSpanSessionManager({ visibilityDoc });
    manager.startSessionSpan();
    manager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property('emb.state', 'background');
  });

  it('should call the session start listener when starting a session', () => {
    const listener = sinon.stub();
    const manager = new EmbraceSpanSessionManager();
    const removeListener = manager.addSessionStartedListener(listener);

    void expect(listener).to.not.have.been.calledOnce;

    manager.startSessionSpan();

    void expect(listener).to.have.been.calledOnce;

    removeListener();
    manager.startSessionSpan();

    void expect(listener).to.have.been.calledOnce;
  });

  it('should call the session ended listener when ending a session', () => {
    const listener = sinon.stub();
    const manager = new EmbraceSpanSessionManager();
    const removeListener = manager.addSessionEndedListener(listener);

    void expect(listener).to.not.have.been.calledOnce;

    manager.startSessionSpan();
    manager.endSessionSpan();

    void expect(listener).to.have.been.calledOnce;

    removeListener();
    manager.startSessionSpan();
    manager.endSessionSpan();

    void expect(listener).to.have.been.calledOnce;
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
    void expect(storedValue).to.be.undefined;
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
    void expect(storedAttribute2).to.be.undefined;
    manager.endSessionSpan();

    const storedAttribute3 = storage.getItem(attributeKey);
    void expect(storedAttribute3).to.be.undefined;
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

  it('should have emb.cold_start = true only in first session', () => {
    manager.startSessionSpan();
    manager.endSessionSpan();

    let finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    let sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property('emb.cold_start', true);
    memoryExporter.reset();

    manager.startSessionSpan();
    manager.endSessionSpan();

    finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property('emb.cold_start', false);
  });
});
