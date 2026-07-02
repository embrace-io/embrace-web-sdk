import { SeverityNumber } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { InMemoryDiagLogger } from '../../../../tests/utils/InMemoryDiagLogger.ts';
import { setupTestLogExporter } from '../../../../tests/utils/setupTestLogExporter.ts';
import { OTelPerformanceManager } from '../../../utils/PerformanceManager/OTelPerformanceManager.ts';
import type { PerformanceManager } from '../../../utils/PerformanceManager/types.ts';
import { RAGE_CLICK_WINDOW_TIME } from './constants.ts';
import { RageClickInstrumentation } from './RageClickInstrumentation.ts';

const { expect } = chai;

// Enough simulated time for the rage click window to finish, plus a small buffer.
const TICK_AFTER_WINDOW = RAGE_CLICK_WINDOW_TIME + 50;

describe('RageClickInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let instrumentation: RageClickInstrumentation;
  let diag: InMemoryDiagLogger;
  let testContainer: HTMLElement;
  let clock: sinon.SinonFakeTimers;

  before(() => {
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
    testContainer = document.createElement('div');
    document.body.append(testContainer);
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    instrumentation.disable();
    testContainer.remove();
    clock.restore();
  });

  const getRageClickLogs = () =>
    memoryExporter
      .getFinishedLogRecords()
      .filter((l) => l.eventName === 'rage-click');

  it('does not emit any rage-click log when no clicks happen', () => {
    instrumentation = new RageClickInstrumentation({ diag });

    expect(getRageClickLogs()).to.have.lengthOf(0);
  });

  it('emits a rage-click log after 3 clicks on the same target within the window', async () => {
    instrumentation = new RageClickInstrumentation({ diag });
    const target = document.createElement('button');
    target.id = 'checkout-btn';
    testContainer.append(target);

    target.click();
    target.click();
    target.click();

    await clock.tickAsync(TICK_AFTER_WINDOW);

    const logs = getRageClickLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].eventName).to.equal('rage-click');
    expect(logs[0].severityNumber).to.equal(SeverityNumber.INFO);
    expect(logs[0].attributes).to.include({
      'emb.type': 'emb.otel_log',
      'rage_click.element_type': 'button',
      'rage_click.element_selector': '#checkout-btn',
      'rage_click.interaction_type': 'click',
      'rage_click.count': 3,
      'rage_click.x': 0,
      'rage_click.y': 0,
    });
  });

  it('does not emit when fewer than 3 clicks occur in the window', async () => {
    instrumentation = new RageClickInstrumentation({ diag });
    const target = document.createElement('button');
    testContainer.append(target);

    target.click();
    target.click();

    await clock.tickAsync(TICK_AFTER_WINDOW);

    expect(getRageClickLogs()).to.have.lengthOf(0);
  });

  it('counts clicks within a radius of the first click, even on different targets', async () => {
    instrumentation = new RageClickInstrumentation({ diag });
    const a = document.createElement('button');
    a.id = 'a';
    a.style.position = 'fixed';
    a.style.left = '0px';
    a.style.top = '0px';
    testContainer.append(a);

    const b = document.createElement('button');
    b.id = 'b';
    b.style.position = 'fixed';
    b.style.left = '40px';
    b.style.top = '0px';
    testContainer.append(b);

    a.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 10,
        clientY: 10,
      }),
    );

    b.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 30,
        clientY: 10,
      }),
    );

    b.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 20,
      }),
    );

    await clock.tickAsync(TICK_AFTER_WINDOW);

    const logs = getRageClickLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.include({
      'rage_click.count': 3,
      'rage_click.element_selector': '#a',
      'rage_click.x': 10,
      'rage_click.y': 10,
    });
  });

  it('does not count clicks outside the radius and on a different target', async () => {
    instrumentation = new RageClickInstrumentation({ diag });

    const a = document.createElement('button');
    a.id = 'a';

    const c = document.createElement('button');
    c.id = 'c';

    testContainer.append(a);
    testContainer.append(c);

    a.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 10,
        clientY: 10,
      }),
    );

    a.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 12,
        clientY: 12,
      }),
    );

    c.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 500,
        clientY: 500,
      }),
    );

    await clock.tickAsync(TICK_AFTER_WINDOW);

    expect(getRageClickLogs()).to.have.lengthOf(0);
  });

  it('marks interaction_type=tap when the first click is a touch PointerEvent', async () => {
    instrumentation = new RageClickInstrumentation({ diag });

    const target = document.createElement('a');
    target.id = 'nav-home';
    testContainer.append(target);

    for (let i = 0; i < 3; i++) {
      target.dispatchEvent(
        new PointerEvent('click', {
          bubbles: true,
          clientX: 44,
          clientY: 72,
          pointerType: 'touch',
        }),
      );
    }

    await clock.tickAsync(TICK_AFTER_WINDOW);

    const logs = getRageClickLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.include({
      'rage_click.element_type': 'a',
      'rage_click.element_selector': '#nav-home',
      'rage_click.interaction_type': 'tap',
      'rage_click.count': 3,
      'rage_click.x': 44,
      'rage_click.y': 72,
    });
  });

  it('does not emit any log for clicks after disable()', async () => {
    instrumentation = new RageClickInstrumentation({ diag });
    const target = document.createElement('button');
    target.id = 'a';
    testContainer.append(target);

    target.click();
    instrumentation.disable();
    target.click();
    target.click();

    await clock.tickAsync(TICK_AFTER_WINDOW);

    expect(getRageClickLogs()).to.have.lengthOf(0);
  });

  it('emits the in-progress window if disable() is called in the middle of a rage click', async () => {
    instrumentation = new RageClickInstrumentation({ diag });

    const target = document.createElement('button');
    target.id = 'a';
    testContainer.append(target);

    target.click();
    target.click();
    target.click();
    target.click();
    instrumentation.disable();

    await clock.tickAsync(TICK_AFTER_WINDOW);

    const logs = getRageClickLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.include({
      'rage_click.count': 4,
      'rage_click.element_selector': '#a',
      'rage_click.x': 0,
      'rage_click.y': 0,
    });
  });

  it('ignores click events whose target is not an Element', async () => {
    instrumentation = new RageClickInstrumentation({ diag });

    for (let i = 0; i < 3; i++) {
      const evt = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(evt, 'target', { value: document });
      document.dispatchEvent(evt);
    }

    await clock.tickAsync(TICK_AFTER_WINDOW);

    expect(getRageClickLogs()).to.have.lengthOf(0);
  });

  it('logs an error if processing a click throws', () => {
    instrumentation = new RageClickInstrumentation({ diag });
    const target = document.createElement('button');
    testContainer.append(target);

    const evt = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(evt, 'timeStamp', {
      get: () => {
        throw new Error('boom');
      },
    });
    target.dispatchEvent(evt);

    expect(diag.getErrorLogs()).to.include(
      'failed to process rage-click candidate',
    );
  });

  it('logs an error if emitting the rage-click log throws', async () => {
    const realPerf = new OTelPerformanceManager();
    const throwingPerf: PerformanceManager = {
      ...realPerf,
      epochMillisFromZeroTime: () => {
        throw new Error('boom');
      },
    };
    instrumentation = new RageClickInstrumentation({
      diag,
      perf: throwingPerf,
    });
    const target = document.createElement('button');
    testContainer.append(target);

    target.click();
    target.click();
    target.click();
    await clock.tickAsync(TICK_AFTER_WINDOW);

    expect(diag.getErrorLogs()).to.include('failed to emit rage-click log');
    expect(getRageClickLogs()).to.have.lengthOf(0);
  });

  it('emits one log per window across consecutive windows', async () => {
    instrumentation = new RageClickInstrumentation({ diag });
    const target = document.createElement('button');
    target.id = 'a';
    testContainer.append(target);

    target.click();
    target.click();
    target.click();
    await clock.tickAsync(TICK_AFTER_WINDOW);

    target.click();
    target.click();
    target.click();
    target.click();
    await clock.tickAsync(TICK_AFTER_WINDOW);

    const logs = getRageClickLogs();
    expect(logs).to.have.lengthOf(2);
    expect(logs[0].attributes['rage_click.count']).to.equal(3);
    expect(logs[1].attributes['rage_click.count']).to.equal(4);
  });
});
