import { SeverityNumber } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import {
  setupTestLogExporter,
  setupTestStorage,
  setupTestTraceExporter,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../../tests/utils/index.ts';
import type { UserSessionManagerInternal } from '../../../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceUserSessionManager,
} from '../../../managers/index.ts';
import { OTelPerformanceManager } from '../../../utils/index.ts';
import { MaxScrollDepthInstrumentation } from './MaxScrollDepthInstrumentation.ts';

const { expect } = chai;

interface ScrollGeometry {
  scrollY: number;
  innerHeight: number;
  scrollHeight: number;
}

describe('MaxScrollDepthInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let userSessionManager: UserSessionManagerInternal;
  let instrumentation: MaxScrollDepthInstrumentation;

  let scrollYValue = 0;
  let innerHeightValue = 0;
  let scrollHeightValue = 0;
  let originalDescriptors: Array<{
    target: object;
    prop: string;
    descriptor?: PropertyDescriptor;
  }> = [];

  const stubGeometry = () => {
    const targets: Array<[object, string, () => number]> = [
      [window, 'scrollY', () => scrollYValue],
      [window, 'innerHeight', () => innerHeightValue],
      [document.documentElement, 'scrollHeight', () => scrollHeightValue],
    ];
    for (const [target, prop, get] of targets) {
      originalDescriptors.push({
        target,
        prop,
        descriptor: Object.getOwnPropertyDescriptor(target, prop),
      });
      Object.defineProperty(target, prop, { configurable: true, get });
    }
  };

  const restoreGeometry = () => {
    for (const { target, prop, descriptor } of originalDescriptors) {
      if (descriptor) {
        Object.defineProperty(target, prop, descriptor);
      } else {
        Reflect.deleteProperty(target, prop);
      }
    }
    originalDescriptors = [];
  };

  // Set the scroll geometry without notifying the instrumentation (the viewport/document size
  // is only read when a log is emitted, not on scroll).
  const setGeometry = ({
    scrollY,
    innerHeight,
    scrollHeight,
  }: ScrollGeometry) => {
    scrollYValue = scrollY;
    innerHeightValue = innerHeight;
    scrollHeightValue = scrollHeight;
  };

  // Set the scroll geometry and notify the instrumentation as the browser would on a scroll.
  const scroll = (geometry: ScrollGeometry) => {
    setGeometry(geometry);
    window.dispatchEvent(new Event('scroll'));
  };

  const getMaxScrollDepthLogs = () =>
    memoryExporter
      .getFinishedLogRecords()
      .filter((l) => l.eventName === 'max-scroll-depth');

  before(() => {
    setupTestTraceExporter();
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    const limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);
    userSessionManager = new EmbraceUserSessionManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      limitManager,
      perf: new OTelPerformanceManager(),
      storage: setupTestStorage(),
      visibilityDoc: window.document,
    });
    userSessionManager.startSessionPartInternal({ reason: 'init' });

    scrollYValue = 0;
    innerHeightValue = 0;
    scrollHeightValue = 0;
    stubGeometry();

    instrumentation = new MaxScrollDepthInstrumentation();
    instrumentation.setUserSessionManager(userSessionManager);
  });

  afterEach(() => {
    instrumentation.disable();
    restoreGeometry();
  });

  it('emits a max-scroll-depth log on session part end with all attributes', () => {
    scroll({ scrollY: 450, innerHeight: 100, scrollHeight: 1000 });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].eventName).to.equal('max-scroll-depth');
    expect(logs[0].severityNumber).to.equal(SeverityNumber.INFO);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 450,
      // scrollable range = scrollHeight - innerHeight = 1000 - 100 = 900; scrollY / 900 = 450 / 900 = 50%
      'max_scroll_depth.percent': 50,
      'max_scroll_depth.did_scroll': 1,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('reports the furthest scroll position reached, not the last one', () => {
    scroll({ scrollY: 700, innerHeight: 100, scrollHeight: 1000 });
    scroll({ scrollY: 200, innerHeight: 100, scrollHeight: 1000 }); // scrolled back up; max should be unaffected

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 700,
      'max_scroll_depth.percent': 78,
      'max_scroll_depth.did_scroll': 1,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('always emits on session part end, even when the user did not scroll', () => {
    setGeometry({ scrollY: 0, innerHeight: 100, scrollHeight: 1000 });

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 0,
      'max_scroll_depth.percent': 0,
      'max_scroll_depth.did_scroll': 0,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('resets the tracked max to the current scroll position on part end ', () => {
    scroll({ scrollY: 900, innerHeight: 100, scrollHeight: 1000 }); // furthest point reached this part
    scroll({ scrollY: 100, innerHeight: 100, scrollHeight: 1000 }); // user scrolls back up
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    // A new session part where the user stays put (no scroll).
    userSessionManager.startSessionPartInternal({ reason: 'init' });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(2);
    // First part reports the furthest point reached (900).
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 900,
      'max_scroll_depth.percent': 100,
      'max_scroll_depth.did_scroll': 1,
      'max_scroll_depth.document_height': 1000,
    });
    // Second part starts from where the user left off (100), not the previous part's 900.
    expect(logs[1].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 100,
      'max_scroll_depth.percent': 11,
      'max_scroll_depth.did_scroll': 0,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('clamps the percentage to 100 when the scroll position exceeds the scrollable range', () => {
    scroll({ scrollY: 1000, innerHeight: 100, scrollHeight: 1000 });

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 1000,
      'max_scroll_depth.percent': 100,
      'max_scroll_depth.did_scroll': 1,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('reports 0 percent when the document is not scrollable', () => {
    setGeometry({ scrollY: 0, innerHeight: 600, scrollHeight: 500 });

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 0,
      'max_scroll_depth.percent': 0,
      'max_scroll_depth.did_scroll': 0,
      'max_scroll_depth.document_height': 500,
    });
  });
});
