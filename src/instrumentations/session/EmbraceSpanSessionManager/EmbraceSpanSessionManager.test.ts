import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { KEY_EMB_SESSION_REASON_ENDED } from '../../../constants/attributes.js';
import {
  InMemoryDiagLogger,
  setupTestTraceExporter,
} from '../../../testUtils/index.js';
import { EmbraceSpanSessionManager } from './EmbraceSpanSessionManager.js';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceSpanSessionManager', () => {
  let manager: EmbraceSpanSessionManager;
  let memoryExporter: InMemorySpanExporter;
  let diag: InMemoryDiagLogger;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
    manager = new EmbraceSpanSessionManager({ diag });
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
});
