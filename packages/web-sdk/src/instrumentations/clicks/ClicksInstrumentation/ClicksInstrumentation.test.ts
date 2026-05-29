/** biome-ignore-all lint/nursery/useDomNodeTextContent: we want to capture what the user sees */
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
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
import { ClicksInstrumentation } from './ClicksInstrumentation.ts';

const { expect } = chai;

describe('ClicksInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: ClicksInstrumentation;
  let diag: InMemoryDiagLogger;
  let userSessionManager: UserSessionManagerInternal;
  let testContainer: HTMLElement;

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
    userSessionManager.startSessionPartInternal('init');
    testContainer = document.createElement('div');
    document.body.append(testContainer);
  });

  afterEach(() => {
    instrumentation.disable();
    testContainer.remove();
  });

  it('should add a span event to the session part when a click is detected', () => {
    instrumentation = new ClicksInstrumentation({
      diag,
    });
    const target = document.createElement('div');
    target.innerText = 'HEY';
    testContainer.append(target);

    target.click();
    userSessionManager.endSessionPartInternal('web_inactivity');

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

  it('should not record clicks for disabled elements', () => {
    instrumentation = new ClicksInstrumentation({
      diag,
    });
    const target = document.createElement('button');
    target.disabled = true;
    testContainer.append(target);

    userSessionManager.endSessionPartInternal('web_inactivity');

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(0);
  });

  it("should include the target's className if available", () => {
    instrumentation = new ClicksInstrumentation({
      diag,
    });
    const target = document.createElement('div');
    target.innerText = 'HEY';
    target.className = 'my-css-class';
    testContainer.append(target);

    target.click();
    userSessionManager.endSessionPartInternal('web_inactivity');

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

  it("should truncate the target's innerText if too long", () => {
    instrumentation = new ClicksInstrumentation({
      diag,
    });
    const target = document.createElement('div');
    target.innerText = 'my long inner text, plus some extra text';
    testContainer.append(target);

    target.click();
    userSessionManager.endSessionPartInternal('web_inactivity');

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

  it('should record multiple clicks', () => {
    instrumentation = new ClicksInstrumentation({
      diag,
    });

    const t1 = document.createElement('button');
    t1.innerText = 'button1';
    testContainer.append(t1);

    const t2 = document.createElement('button');
    t2.innerText = 'button2';
    testContainer.append(t2);

    t2.click();
    t1.click();
    t2.click();
    userSessionManager.endSessionPartInternal('web_inactivity');

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(3);

    void expect(
      sessionSpan.events.map((e) => ({
        name: e.name,
        attributes: e.attributes,
      })),
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

  it('should stop recording after the instrumentation has been disabled', () => {
    instrumentation = new ClicksInstrumentation({
      diag,
    });

    const t1 = document.createElement('button');
    t1.innerText = 'button1';
    testContainer.append(t1);

    const t2 = document.createElement('button');
    t2.innerText = 'button2';
    testContainer.append(t2);

    t2.click();
    instrumentation.disable();
    t1.click();
    userSessionManager.endSessionPartInternal('web_inactivity');

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

  it('should not record if the session part is not active', () => {
    instrumentation = new ClicksInstrumentation({
      diag,
    });

    const t1 = document.createElement('button');
    t1.innerText = 'button1';
    testContainer.append(t1);

    const t2 = document.createElement('button');
    t2.innerText = 'button2';
    testContainer.append(t2);

    t2.click();
    userSessionManager.endSessionPartInternal('web_inactivity');
    t1.click();

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

  it('should allow tracking to be omitted for certain elements', () => {
    instrumentation = new ClicksInstrumentation({
      diag,
      shouldTrack: (element) => !element.hasAttribute('data-is-sensitive'),
    });
    const target1 = document.createElement('div');
    target1.setAttribute('data-is-sensitive', 'true');
    target1.innerText = 'should not track';
    testContainer.append(target1);

    const target2 = document.createElement('div');
    target2.innerText = 'should track';
    testContainer.append(target2);

    target1.click();
    target2.click();
    userSessionManager.endSessionPartInternal('web_inactivity');

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    const clickEvent = sessionSpan.events[0];

    void expect(clickEvent.name).to.be.equal('click');

    void expect(clickEvent.attributes).to.deep.equal({
      'emb.type': 'ux.tap',
      'tap.coords': '0,0',
      'view.name': '<div>should track</div>',
    });
  });

  it('should allow the inner text parsing to be customized for certain elements', () => {
    instrumentation = new ClicksInstrumentation({
      diag,
      innerTextForElement: (element) =>
        element.hasAttribute('data-is-sensitive')
          ? '[REDACTED]'
          : element.innerText,
    });
    const target1 = document.createElement('div');
    target1.setAttribute('data-is-sensitive', 'true');
    target1.innerText = 'should not track';
    testContainer.append(target1);

    const target2 = document.createElement('div');
    target2.innerText = 'should track';
    testContainer.append(target2);

    target1.click();
    target2.click();
    userSessionManager.endSessionPartInternal('web_inactivity');

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(2);

    void expect(sessionSpan.events[0].name).to.be.equal('click');
    void expect(sessionSpan.events[0].attributes).to.deep.equal({
      'emb.type': 'ux.tap',
      'tap.coords': '0,0',
      'view.name': '<div>[REDACTED]</div>',
    });

    void expect(sessionSpan.events[1].name).to.be.equal('click');
    void expect(sessionSpan.events[1].attributes).to.deep.equal({
      'emb.type': 'ux.tap',
      'tap.coords': '0,0',
      'view.name': '<div>should track</div>',
    });
  });
});
