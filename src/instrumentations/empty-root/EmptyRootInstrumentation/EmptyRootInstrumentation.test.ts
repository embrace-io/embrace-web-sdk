import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { session } from '../../../api-sessions/index.js';
import type { SpanSessionManager } from '../../../api-sessions/index.js';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSpanSessionManager,
} from '../../../managers/index.js';
import {
  InMemoryDiagLogger,
  setupTestTraceExporter,
} from '../../../testUtils/index.js';
import { EmptyRootInstrumentation } from './EmptyRootInstrumentation.js';

const { expect } = chai;

describe('EmptyInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: EmptyRootInstrumentation;
  let diag: InMemoryDiagLogger;
  let spanSessionManager: SpanSessionManager;
  let testContainer: HTMLElement;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });
    session.setGlobalSessionManager(spanSessionManager);
    spanSessionManager.startSessionSpan();
    testContainer = document.createElement('div');
    document.body.append(testContainer);
  });

  afterEach(() => {
    instrumentation.disable();
    testContainer.remove();
  });

  it('should add a span event to the session when the root node becomes empty', async () => {
    const rootNode = document.createElement('div');
    const child1 = document.createElement('div');
    const child2 = document.createElement('div');

    rootNode.append(child1, child2);
    testContainer.append(rootNode);

    instrumentation = new EmptyRootInstrumentation({
      diag,
      bodyDoc: { body: testContainer },
      emptyCheckDelay: 10,
    });

    // Clear out the root node
    child1.remove();
    child2.remove();

    // Yield so that the mutation observer callbacks can trigger
    await new Promise(r => setTimeout(r, 1));

    // The instrumentation shouldn't immediately emit the event
    spanSessionManager.endSessionSpan();

    let finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    let sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(0);
    memoryExporter.reset();

    spanSessionManager.startSessionSpan();

    await new Promise(r => setTimeout(r, 20));

    // Should now emit if the node is still empty after the timeout
    spanSessionManager.endSessionSpan();
    finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    const event = sessionSpan.events[0];
    expect(event.name).to.be.equal('empty-root-node');
    expect(event.attributes).to.deep.equal({
      'emb.type': 'empty-root-node',
    });
  });

  it('should not emit if the root node was not fully emptied', async () => {
    const rootNode = document.createElement('div');
    const child1 = document.createElement('div');
    const child2 = document.createElement('div');

    rootNode.append(child1, child2);
    testContainer.append(rootNode);

    instrumentation = new EmptyRootInstrumentation({
      diag,
      bodyDoc: { body: testContainer },
      emptyCheckDelay: 10,
    });

    child1.remove();

    // Yield so that the mutation observer callbacks can trigger
    await new Promise(r => setTimeout(r, 1));

    // Wait for the empty check to be performed
    await new Promise(r => setTimeout(r, 20));

    // Should not emit the event
    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(0);
  });

  it('should not emit if the root node was populated after being emptied', async () => {
    const rootNode = document.createElement('div');
    const child1 = document.createElement('div');
    const child2 = document.createElement('div');

    rootNode.append(child1, child2);
    testContainer.append(rootNode);

    instrumentation = new EmptyRootInstrumentation({
      diag,
      bodyDoc: { body: testContainer },
      emptyCheckDelay: 10,
    });

    child1.remove();
    child2.remove();

    // Yield so that the mutation observer callbacks can trigger
    await new Promise(r => setTimeout(r, 1));

    rootNode.append(child1);

    // Wait for the empty check to be performed
    await new Promise(r => setTimeout(r, 20));

    // Should not emit the event
    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(0);
  });

  it('should do nothing if the root node could not be determined', async () => {
    const child1 = document.createElement('div');
    const child2 = document.createElement('div');

    testContainer.append(child1, child2);

    instrumentation = new EmptyRootInstrumentation({
      diag,
      bodyDoc: { body: testContainer },
      emptyCheckDelay: 10,
    });

    expect(diag.getDebugLogs()).to.deep.equal([
      'body did not have exactly one child, could not determine root node',
    ]);

    child1.remove();
    child2.remove();

    // Yield so that the mutation observer callbacks can trigger
    await new Promise(r => setTimeout(r, 1));

    // Wait for the empty check to be performed
    await new Promise(r => setTimeout(r, 20));

    // Should not emit the event
    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(0);
  });

  it('should allow the root node to be specified explicitly', async () => {
    const child1 = document.createElement('div');
    const child2 = document.createElement('div');
    const child3 = document.createElement('div');

    child1.append(child3);
    testContainer.append(child1, child2);

    instrumentation = new EmptyRootInstrumentation({
      diag,
      bodyDoc: { body: testContainer },
      emptyCheckDelay: 10,
      rootNode: child1,
    });

    child3.remove();

    // Yield so that the mutation observer callbacks can trigger
    await new Promise(r => setTimeout(r, 1));

    // Wait for the empty check to be performed
    await new Promise(r => setTimeout(r, 20));

    // Should emit the event
    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    const event = sessionSpan.events[0];
    expect(event.name).to.be.equal('empty-root-node');
    expect(event.attributes).to.deep.equal({
      'emb.type': 'empty-root-node',
    });
  });
});
