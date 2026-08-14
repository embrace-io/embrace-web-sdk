import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import {
  InMemoryDiagLogger,
  setupTestStorage,
  setupTestTraceExporter,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../../tests/utils/index.ts';
import { session } from '../../../api-sessions/index.ts';
import type { UserSessionManagerInternal } from '../../../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceUserSessionManager,
} from '../../../managers/index.ts';
import { OTelPerformanceManager } from '../../../utils/index.ts';
import { EmptyRootInstrumentation } from './EmptyRootInstrumentation.ts';

const { expect } = chai;

describe('EmptyInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: EmptyRootInstrumentation;
  let diag: InMemoryDiagLogger;
  let userSessionManager: UserSessionManagerInternal;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
    userSessionManager = new EmbraceUserSessionManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      perf: new OTelPerformanceManager(),
      storage: setupTestStorage(),
      visibilityDoc: window.document,
    });
    session.setGlobalUserSessionManager(userSessionManager);
    userSessionManager.startSessionPartInternal({ reason: 'init' });
  });

  afterEach(() => {
    instrumentation.disable();
  });

  it('should add a span event to the session part when the root node becomes empty', async () => {
    const rootNode = document.createElement('div');
    const child1 = document.createElement('div');
    const child2 = document.createElement('div');

    rootNode.append(child1, child2);

    instrumentation = new EmptyRootInstrumentation({
      diag,
      rootNode,
      emptyCheckDelayMs: 10,
    });

    // Clear out the root node
    child1.remove();
    child2.remove();

    // Yield so that the mutation observer callbacks can trigger
    await new Promise((r) => setTimeout(r, 1));

    // The instrumentation shouldn't immediately emit the event
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    let finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    let sessionSpan = finishedSpans[0]!;
    expect(sessionSpan.events).to.have.lengthOf(0);
    memoryExporter.reset();

    userSessionManager.startSessionPartInternal({ reason: 'init' });

    await new Promise((r) => setTimeout(r, 20));

    // Should now emit if the node is still empty after the timeout
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });
    finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    sessionSpan = finishedSpans[0]!;
    expect(sessionSpan.events).to.have.lengthOf(1);

    const event = sessionSpan.events[0]!;
    expect(event.name).to.be.equal('empty-root-node');
    expect(event.attributes).to.deep.equal({
      'emb.type': 'ux.empty_root_node',
    });
  });

  it('should not emit if the root node was not fully emptied', async () => {
    const rootNode = document.createElement('div');
    const child1 = document.createElement('div');
    const child2 = document.createElement('div');

    rootNode.append(child1, child2);

    instrumentation = new EmptyRootInstrumentation({
      diag,
      rootNode,
      emptyCheckDelayMs: 10,
    });

    child1.remove();

    // Yield so that the mutation observer callbacks can trigger
    await new Promise((r) => setTimeout(r, 1));

    // Wait for the empty check to be performed
    await new Promise((r) => setTimeout(r, 20));

    // Should not emit the event
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0]!;
    expect(sessionSpan.events).to.have.lengthOf(0);
  });

  it('should not emit if the root node was populated after being emptied', async () => {
    const rootNode = document.createElement('div');
    const child1 = document.createElement('div');
    const child2 = document.createElement('div');

    rootNode.append(child1, child2);

    instrumentation = new EmptyRootInstrumentation({
      diag,
      rootNode,
      emptyCheckDelayMs: 10,
    });

    child1.remove();
    child2.remove();

    // Yield so that the mutation observer callbacks can trigger
    await new Promise((r) => setTimeout(r, 1));

    rootNode.append(child1);

    // Wait for the empty check to be performed
    await new Promise((r) => setTimeout(r, 20));

    // Should not emit the event
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0]!;
    expect(sessionSpan.events).to.have.lengthOf(0);
  });

  it('should handle root node being removed after init', async () => {
    const container = document.createElement('div');
    const rootNode = document.createElement('div');

    container.append(rootNode);

    instrumentation = new EmptyRootInstrumentation({
      diag,
      rootNode,
      emptyCheckDelayMs: 10,
    });

    rootNode.remove();

    // Yield so that the mutation observer callbacks can trigger
    await new Promise((r) => setTimeout(r, 1));

    // Wait for the empty check to be performed
    await new Promise((r) => setTimeout(r, 20));

    // Should not emit the event
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0]!;
    expect(sessionSpan.events).to.have.lengthOf(0);
  });

  it('should handle supplied root node being null', async () => {
    instrumentation = new EmptyRootInstrumentation({
      diag,
      rootNode: null,
      emptyCheckDelayMs: 10,
    });

    expect(diag.getWarnLogs()).to.deep.equal([
      "supplied root node was null, this instrumentation won't be enabled",
    ]);

    // Yield so that the mutation observer callbacks can trigger
    await new Promise((r) => setTimeout(r, 1));

    // Wait for the empty check to be performed
    await new Promise((r) => setTimeout(r, 20));

    // Should not emit the event
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0]!;
    expect(sessionSpan.events).to.have.lengthOf(0);
  });
});
