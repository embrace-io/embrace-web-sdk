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
      'Trying to end a session, but there is no session in progress. This is a no-op.'
    );
  });

  it('should not fail if trying to add breadcrumb to non active session', () => {
    manager.addBreadcrumb('some breadcrumb');

    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'Trying to add breadcrumb to a session, but there is no session in progress. This is a no-op.'
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
      'Trying to add properties to a session, but there is no session in progress. This is a no-op.'
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
    const key = 'permanent-key';
    const value = 'permanent-value';
    manager.startSessionSpan();
    manager.addProperty(key, value, {
      lifespan: 'permanent',
    });

    const storedValue = storage.getItem(`${KEY_PREFIX_EMB_PROPERTIES}${key}`);
    expect(storedValue).to.equal(value);
  });

  it('should not store session properties in localStorage', () => {
    const key = 'permanent-key';
    const value = 'permanent-value';
    manager.startSessionSpan();
    manager.addProperty(key, value);

    const storedValue = storage.getItem(`${KEY_PREFIX_EMB_PROPERTIES}${key}`);
    void expect(storedValue).to.be.undefined;
  });

  it('should not store default session properties in localStorage', () => {
    const key = 'permanent-key';
    const value = 'permanent-value';
    manager.startSessionSpan();
    manager.addProperty(key, value, {
      // @ts-expect-error asserting an invalid value for lifespan
      lifespan: 'invalid',
    });

    const storedValue = storage.getItem(`${KEY_PREFIX_EMB_PROPERTIES}${key}`);
    void expect(storedValue).to.be.undefined;
  });

  it('should persist permanent properties across sessions', () => {
    const key = 'permanent-key';
    const value = 'permanent-value';
    manager.startSessionSpan();
    manager.addProperty(key, value, { lifespan: 'permanent' });

    const storedProperty = storage.getItem(
      `${KEY_PREFIX_EMB_PROPERTIES}${key}`
    );
    expect(storedProperty).to.equal(value);

    manager.endSessionSpan();
    manager.startSessionSpan();
    const storedProperty2 = storage.getItem(
      `${KEY_PREFIX_EMB_PROPERTIES}${key}`
    );
    expect(storedProperty2).to.equal(value);
  });

  it('should not persist permanent properties that have been removed', () => {
    const key = 'permanent-key';
    const value = 'permanent-value';
    manager.startSessionSpan();
    manager.addProperty(key, value, { lifespan: 'permanent' });

    let storedProperty = storage.getItem(`${KEY_PREFIX_EMB_PROPERTIES}${key}`);
    expect(storedProperty).to.equal(value);

    manager.removeProperty(key);
    storedProperty = storage.getItem(`${KEY_PREFIX_EMB_PROPERTIES}${key}`);
    void expect(storedProperty).to.be.undefined;

    manager.endSessionSpan();

    manager.startSessionSpan();
    storedProperty = storage.getItem(`${KEY_PREFIX_EMB_PROPERTIES}${key}`);
    void expect(storedProperty).to.be.undefined;
  });
});
