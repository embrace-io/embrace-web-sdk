import { SeverityNumber } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import {
  createTestDynamicConfigManager,
  InMemoryDiagLogger,
  setupTestLogExporter,
  setupTestStorage,
} from '../../../../tests/utils/index.ts';
import { session } from '../../../api-sessions/index.ts';
import type { UserSessionManagerInternal } from '../../../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceUserSessionManager,
} from '../../../managers/index.ts';
import { OTelPerformanceManager } from '../../../utils/index.ts';
import { FirstInteractionInstrumentation } from './FirstInteractionInstrumentation.ts';

const { expect } = chai;

describe('FirstInteractionInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let instrumentation: FirstInteractionInstrumentation;
  let diag: InMemoryDiagLogger;
  let testContainer: HTMLElement;
  let userSessionManager: UserSessionManagerInternal;

  before(() => {
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
    testContainer = document.createElement('div');
    document.body.append(testContainer);

    userSessionManager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      perf: new OTelPerformanceManager(),
      storage: setupTestStorage(),
      visibilityDoc: window.document,
      dynamicConfigManager: createTestDynamicConfigManager(),
    });

    session.setGlobalUserSessionManager(userSessionManager);
  });

  afterEach(() => {
    instrumentation.disable();
    testContainer.remove();
  });

  const getLogs = () =>
    memoryExporter
      .getFinishedLogRecords()
      .filter((l) => l.eventName === 'first-interaction');

  it('does not emit any log when no interaction happens', () => {
    instrumentation = new FirstInteractionInstrumentation({ diag });

    expect(getLogs()).to.have.lengthOf(0);
  });

  it('emits a click event on click with pointerType=mouse', () => {
    instrumentation = new FirstInteractionInstrumentation({ diag });

    const target = document.createElement('button');
    target.id = 'go';
    testContainer.append(target);

    const clickEvent = new PointerEvent('click', {
      bubbles: true,
      clientX: 12,
      clientY: 34,
      pointerType: 'mouse',
    });
    target.dispatchEvent(clickEvent);

    const logs = getLogs();

    expect(logs).to.have.lengthOf(1);
    expect(logs[0].eventName).to.equal('first-interaction');
    expect(logs[0].severityNumber).to.equal(SeverityNumber.INFO);
    expect(logs[0].attributes).to.include({
      'emb.type': 'emb.otel_log',
      'first_interaction.interaction_type': 'click',
      'first_interaction.element_type': 'button',
      'first_interaction.element_selector': '#go',
      'first_interaction.x': 12,
      'first_interaction.y': 34,
      'first_interaction.time': clickEvent.timeStamp,
    });
  });

  it('emits a tap event on click with pointerType=touch', () => {
    instrumentation = new FirstInteractionInstrumentation({ diag });

    const target = document.createElement('a');
    target.id = 'home';
    testContainer.append(target);

    target.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 5,
        clientY: 9,
        pointerType: 'touch',
      }),
    );

    const logs = getLogs();

    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.include({
      'first_interaction.interaction_type': 'tap',
      'first_interaction.element_type': 'a',
      'first_interaction.element_selector': '#home',
      'first_interaction.x': 5,
      'first_interaction.y': 9,
    });
  });

  it('emits a keypress event on keydown with no coordinates', () => {
    instrumentation = new FirstInteractionInstrumentation({ diag });

    const input = document.createElement('input');
    input.id = 'search';
    testContainer.append(input);
    input.focus();

    input.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'a' }),
    );

    const logs = getLogs();
    const attrs = logs[0].attributes;

    expect(logs).to.have.lengthOf(1);
    expect(attrs).to.include({
      'first_interaction.interaction_type': 'keypress',
      'first_interaction.element_type': 'input',
      'first_interaction.element_selector': '#search',
    });
    expect(attrs).to.not.have.property('first_interaction.x');
    expect(attrs).to.not.have.property('first_interaction.y');
  });

  it('emits a scroll event with element_type=document and empty selector', () => {
    instrumentation = new FirstInteractionInstrumentation({ diag });

    document.dispatchEvent(new Event('scroll', { bubbles: true }));

    const logs = getLogs();
    const attrs = logs[0].attributes;

    expect(logs).to.have.lengthOf(1);
    expect(attrs).to.include({
      'first_interaction.interaction_type': 'scroll',
      'first_interaction.element_type': 'document',
      'first_interaction.element_selector': '',
    });
    expect(attrs).to.not.have.property('first_interaction.x');
    expect(attrs).to.not.have.property('first_interaction.y');
  });

  it('emits only once across multiple interactions', () => {
    instrumentation = new FirstInteractionInstrumentation({ diag });

    const target = document.createElement('button');
    target.id = 'first';
    testContainer.append(target);

    target.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 1,
        clientY: 2,
        pointerType: 'mouse',
      }),
    );

    target.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 3,
        clientY: 4,
        pointerType: 'touch',
      }),
    );

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    document.dispatchEvent(new Event('scroll', { bubbles: true }));

    const logs = getLogs();

    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.include({
      'first_interaction.interaction_type': 'click',
      'first_interaction.element_selector': '#first',
      'first_interaction.x': 1,
      'first_interaction.y': 2,
    });
  });

  it('re-registers listeners on session part start', () => {
    instrumentation = new FirstInteractionInstrumentation({ diag });

    const target = document.createElement('button');
    target.id = 'a';
    testContainer.append(target);

    target.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 1,
        clientY: 1,
        pointerType: 'mouse',
      }),
    );

    expect(getLogs()).to.have.lengthOf(1);
    expect(getLogs()[0].attributes).to.include({
      'first_interaction.interaction_type': 'click',
    });

    userSessionManager.startSessionPartInternal({ reason: 'init' });

    const target2 = document.createElement('a');
    target2.id = 'b';
    testContainer.append(target2);
    target2.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 10,
        clientY: 20,
        pointerType: 'touch',
      }),
    );

    const logs = getLogs();

    expect(logs).to.have.lengthOf(2);
    expect(logs[1].attributes).to.include({
      'first_interaction.interaction_type': 'tap',
      'first_interaction.element_selector': '#b',
      'first_interaction.x': 10,
      'first_interaction.y': 20,
    });
  });

  it('does not emit after disable()', () => {
    const target = document.createElement('button');
    testContainer.append(target);

    instrumentation = new FirstInteractionInstrumentation({ diag });
    instrumentation.disable();

    target.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 0,
        clientY: 0,
        pointerType: 'mouse',
      }),
    );

    expect(getLogs()).to.have.lengthOf(0);
  });

  it('does not re-register on session part start after disable()', () => {
    instrumentation = new FirstInteractionInstrumentation({ diag });
    instrumentation.disable();

    userSessionManager.startSessionPartInternal({ reason: 'init' });

    const target = document.createElement('button');
    testContainer.append(target);
    target.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 0,
        clientY: 0,
        pointerType: 'mouse',
      }),
    );

    expect(getLogs()).to.have.lengthOf(0);
  });

  it('does not re-attach listeners when they are already attached', () => {
    instrumentation = new FirstInteractionInstrumentation({ diag });

    // Listeners are attached in the constructor; calling enable() again while
    // they are still attached must be a no-op rather than double-registering.
    instrumentation.enable();

    const target = document.createElement('button');
    target.id = 'again';
    testContainer.append(target);

    target.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 1,
        clientY: 2,
        pointerType: 'mouse',
      }),
    );

    expect(getLogs()).to.have.lengthOf(1);
  });

  it('ignores a second handler that fires after listeners are detached', () => {
    instrumentation = new FirstInteractionInstrumentation({ diag });

    const target = document.createElement('button');
    testContainer.append(target);

    target.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 1,
        clientY: 2,
        pointerType: 'mouse',
      }),
    );

    expect(getLogs()).to.have.lengthOf(1);

    // Simulate a second handler that was already queued firing after the first
    // interaction detached the listeners. It must be ignored.
    instrumentation['_onClick'](
      new PointerEvent('click', {
        bubbles: true,
        clientX: 3,
        clientY: 4,
        pointerType: 'mouse',
      }),
    );

    expect(getLogs()).to.have.lengthOf(1);
  });

  it('logs a diagnostic error when emitting fails', () => {
    instrumentation = new FirstInteractionInstrumentation({ diag });

    const target = document.createElement('button');
    testContainer.append(target);

    // Sabotage the logger to throw while processing the interaction.
    instrumentation['logger'].emit = () => {
      throw new Error('emit failed');
    };

    target.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 1,
        clientY: 2,
        pointerType: 'mouse',
      }),
    );

    expect(diag.getErrorLogs().length).to.be.greaterThan(0);
  });
});
