import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import {
  session,
  type SpanSessionManager,
} from '../../../api-sessions/index.js';
import { InMemoryDiagLogger } from '../../../testUtils/index.js';
import { setupTestTraceExporter } from '../../../testUtils/setupTestTraceExporter/setupTestTraceExporter.js';
import { EmbraceSpanSessionManager } from '../../session/index.js';
import { ClicksInstrumentation } from './ClicksInstrumentation.js';
import userEvent from '@testing-library/user-event';

const { expect } = chai;

describe('ClicksInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: ClicksInstrumentation;
  let diag: InMemoryDiagLogger;
  let spanSessionManager: SpanSessionManager;
  let testContainer: HTMLElement;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
    spanSessionManager = new EmbraceSpanSessionManager();
    session.setGlobalSessionManager(spanSessionManager);
    spanSessionManager.startSessionSpan();
    testContainer = document.createElement('div');
    document.body.append(testContainer);
  });

  afterEach(() => {
    instrumentation.disable();
    testContainer.remove();
  });

  it('should add a span event to the session when a click is detected', async () => {
    const user = userEvent.setup();
    instrumentation = new ClicksInstrumentation({
      diag,
    });
    const target = document.createElement('div');
    target.innerText = 'HEY';
    testContainer.append(target);

    await user.click(target);
    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    const clickEvent = sessionSpan.events[0];

    void expect(clickEvent.name).to.be.equal('click');

    void expect(clickEvent.attributes).to.deep.equal({
      'emb.type': 'ux.tap',
      'tap.coords': '0,0',
      'view.name': '<div>HEY</div>',
    });
  });

  it('should not record clicks for disabled elements', async () => {
    const user = userEvent.setup();
    instrumentation = new ClicksInstrumentation({
      diag,
    });
    const target = document.createElement('button');
    target.disabled = true;
    testContainer.append(target);

    await user.click(target);
    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(0);
  });

  it("should include the target's className if available", async () => {
    const user = userEvent.setup();
    instrumentation = new ClicksInstrumentation({
      diag,
    });
    const target = document.createElement('div');
    target.innerText = 'HEY';
    target.className = 'my-css-class';
    testContainer.append(target);

    await user.click(target);
    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    const clickEvent = sessionSpan.events[0];

    void expect(clickEvent.name).to.be.equal('click');

    void expect(clickEvent.attributes).to.deep.equal({
      'emb.type': 'ux.tap',
      'tap.coords': '0,0',
      'view.name': '<div class="my-css-class">HEY</div>',
    });
  });

  it("should truncate the target's innerText if too long", async () => {
    const user = userEvent.setup();
    instrumentation = new ClicksInstrumentation({
      diag,
    });
    const target = document.createElement('div');
    target.innerText = 'my long inner text, plus some extra text';
    testContainer.append(target);

    await user.click(target);
    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    const clickEvent = sessionSpan.events[0];

    void expect(clickEvent.name).to.be.equal('click');

    void expect(clickEvent.attributes).to.deep.equal({
      'emb.type': 'ux.tap',
      'tap.coords': '0,0',
      'view.name': '<div>my long inner text, plus some ...</div>',
    });
  });

  it('should record multiple clicks', async () => {
    const user = userEvent.setup();
    instrumentation = new ClicksInstrumentation({
      diag,
    });

    const t1 = document.createElement('button');
    t1.innerText = 'button1';
    testContainer.append(t1);

    const t2 = document.createElement('button');
    t2.innerText = 'button2';
    testContainer.append(t2);

    await user.click(t2);
    await user.click(t1);
    await user.click(t2);
    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(3);

    void expect(
      sessionSpan.events.map(e => ({ name: e.name, attributes: e.attributes }))
    ).to.deep.equal([
      {
        name: 'click',
        attributes: {
          'emb.type': 'ux.tap',
          'tap.coords': '0,0',
          'view.name': '<button>button2</button>',
        },
      },
      {
        name: 'click',
        attributes: {
          'emb.type': 'ux.tap',
          'tap.coords': '0,0',
          'view.name': '<button>button1</button>',
        },
      },
      {
        name: 'click',
        attributes: {
          'emb.type': 'ux.tap',
          'tap.coords': '0,0',
          'view.name': '<button>button2</button>',
        },
      },
    ]);
  });

  it('should stop recording after the instrumentation has been disabled', async () => {
    const user = userEvent.setup();
    instrumentation = new ClicksInstrumentation({
      diag,
    });

    const t1 = document.createElement('button');
    t1.innerText = 'button1';
    testContainer.append(t1);

    const t2 = document.createElement('button');
    t2.innerText = 'button2';
    testContainer.append(t2);

    await user.click(t2);
    instrumentation.disable();
    await user.click(t1);
    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);
    const clickEvent = sessionSpan.events[0];

    void expect(clickEvent.name).to.be.equal('click');

    void expect(clickEvent.attributes).to.deep.equal({
      'emb.type': 'ux.tap',
      'tap.coords': '0,0',
      'view.name': '<button>button2</button>',
    });
  });

  it('should not record if the session is not active', async () => {
    const user = userEvent.setup();
    instrumentation = new ClicksInstrumentation({
      diag,
    });

    const t1 = document.createElement('button');
    t1.innerText = 'button1';
    testContainer.append(t1);

    const t2 = document.createElement('button');
    t2.innerText = 'button2';
    testContainer.append(t2);

    await user.click(t2);
    spanSessionManager.endSessionSpan();
    await user.click(t1);

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);
    const clickEvent = sessionSpan.events[0];

    void expect(clickEvent.name).to.be.equal('click');

    void expect(clickEvent.attributes).to.deep.equal({
      'emb.type': 'ux.tap',
      'tap.coords': '0,0',
      'view.name': '<button>button2</button>',
    });
  });
});
