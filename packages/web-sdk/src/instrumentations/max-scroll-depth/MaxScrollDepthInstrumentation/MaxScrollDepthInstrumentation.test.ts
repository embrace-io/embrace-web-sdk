import { SeverityNumber } from '@opentelemetry/api-logs';
import type {
  InMemoryLogRecordExporter,
  LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
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
  viewportHeight: number;
  documentHeight: number;
}

// The instrumentation only measures the vertical axis, but a scroll root is only
// measurable when it has a layout box on both, so the horizontal axis gets a
// fixed non-zero size that no assertion depends on.
const HORIZONTAL_SIZE = 600;

describe('MaxScrollDepthInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let userSessionManager: UserSessionManagerInternal;
  let instrumentation: MaxScrollDepthInstrumentation;

  let scrollYValue = 0;
  let viewportHeightValue = 0;
  let documentHeightValue = 0;
  let scrollRootValue: Element | null = null;
  let originalDescriptors: Array<{
    target: object;
    prop: string;
    descriptor?: PropertyDescriptor;
  }> = [];

  const stubGeometry = () => {
    // A detached element stands in for the scrolling element so the dimensions
    // the instrumentation reads cannot coincide with the real document root's:
    // in this standards-mode document, scrollingElement *is* that root.
    const scrollRoot = document.createElement('div');
    scrollRootValue = scrollRoot;
    // Both the scroll root and the real root carry the same sizes, and so does
    // the window, so dropping the scroll root changes which element each side is
    // read from without changing any value. What each source reports for a real
    // document is measureDocument's own concern, covered by its tests.
    const targets: Array<[object, string, () => unknown]> = [
      [window, 'scrollY', () => scrollYValue],
      [window, 'innerHeight', () => viewportHeightValue],
      [window, 'innerWidth', () => HORIZONTAL_SIZE],
      [document.documentElement, 'scrollHeight', () => documentHeightValue],
      [document.documentElement, 'scrollWidth', () => HORIZONTAL_SIZE],
      [scrollRoot, 'scrollHeight', () => documentHeightValue],
      [scrollRoot, 'clientHeight', () => viewportHeightValue],
      [scrollRoot, 'scrollWidth', () => HORIZONTAL_SIZE],
      [scrollRoot, 'clientWidth', () => HORIZONTAL_SIZE],
      [
        document,
        'scrollingElement',
        () => {
          // Armed by failNextMeasurement(); scrollingElement is the earliest
          // measureDocument read this stub already owns, so it is the cheapest seam.
          if (failNextMeasurementArmed) {
            failNextMeasurementArmed = false;
            throw new Error('injected measureDocument failure');
          }
          return scrollRootValue;
        },
      ],
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
    viewportHeight,
    documentHeight,
  }: ScrollGeometry) => {
    scrollYValue = scrollY;
    viewportHeightValue = viewportHeight;
    documentHeightValue = documentHeight;
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

  // Armed by failNextEmit(); placed ahead of the exporter in the processor
  // chain so it can block a single log from reaching it without a real export failure.
  let failNextEmitArmed = false;
  const failingProcessor: LogRecordProcessor = {
    onEmit: () => {
      if (failNextEmitArmed) {
        failNextEmitArmed = false;
        throw new Error('injected onEmit failure');
      }
    },
    forceFlush: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
  };
  const failNextEmit = () => {
    failNextEmitArmed = true;
  };

  let failNextMeasurementArmed = false;
  const failNextMeasurement = () => {
    failNextMeasurementArmed = true;
  };

  before(() => {
    setupTestTraceExporter();
    memoryExporter = setupTestLogExporter([failingProcessor]);
  });

  beforeEach(() => {
    failNextEmitArmed = false;
    failNextMeasurementArmed = false;
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
    viewportHeightValue = 0;
    documentHeightValue = 0;
    stubGeometry();

    instrumentation = new MaxScrollDepthInstrumentation();
    instrumentation.setUserSessionManager(userSessionManager);
  });

  afterEach(() => {
    instrumentation.disable();
    restoreGeometry();
  });

  it('emits a max-scroll-depth log on session part end with all attributes', () => {
    scroll({ scrollY: 450, viewportHeight: 100, documentHeight: 1000 });
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
      // scrollable range = documentHeight - viewportHeight = 1000 - 100 = 900; scrollY / 900 = 450 / 900 = 50%
      'max_scroll_depth.percent': 50,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('reports the furthest scroll position reached, not the last one', () => {
    scroll({ scrollY: 700, viewportHeight: 100, documentHeight: 1000 });
    scroll({ scrollY: 200, viewportHeight: 100, documentHeight: 1000 }); // scrolled back up; max should be unaffected

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 700,
      'max_scroll_depth.percent': 78,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('always emits on session part end, even when the user did not scroll', () => {
    setGeometry({ scrollY: 0, viewportHeight: 100, documentHeight: 1000 });

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 0,
      'max_scroll_depth.percent': 0,
      'max_scroll_depth.did_scroll': false,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('resets the tracked max to the current scroll position on part end ', () => {
    scroll({ scrollY: 900, viewportHeight: 100, documentHeight: 1000 }); // furthest point reached this part
    scroll({ scrollY: 100, viewportHeight: 100, documentHeight: 1000 }); // user scrolls back up
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
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 1000,
    });
    // Second part starts from where the user left off (100), not the previous part's 900.
    expect(logs[1].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 100,
      'max_scroll_depth.percent': 11,
      'max_scroll_depth.did_scroll': false,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('does not leak part state into the next session part when the emit throws', () => {
    // The rubber band leaves the live position past the true bottom (900), so
    // the seed left behind shows whether the reset kept the measurement it took.
    scroll({ scrollY: 960, viewportHeight: 100, documentHeight: 1000 });
    failNextEmit();
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    // Part 2 ends unmeasurable, so nothing bounds its depth at emit and the
    // position carried out of the throwing emit is the only thing deciding it.
    userSessionManager.startSessionPartInternal({ reason: 'init' });
    setGeometry({ scrollY: 0, viewportHeight: 0, documentHeight: 1000 });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    // The throwing emit produced no log, but the reset must still have run.
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 900,
      'max_scroll_depth.did_scroll': false,
    });
  });

  it('clamps the carried position to the measured scrollable range on overscroll past the bottom', () => {
    // Safari rubber-bands past the true bottom (900) of this document.
    scroll({ scrollY: 960, viewportHeight: 100, documentHeight: 1000 });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    // Part 2 ends unmeasurable, so nothing bounds its depth at emit and the
    // position carried out of part 1 is the only thing deciding what it reports.
    userSessionManager.startSessionPartInternal({ reason: 'init' });
    setGeometry({ scrollY: 900, viewportHeight: 0, documentHeight: 1000 });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(2);
    // Part 1 reports the real bottom, not the 960 the rubber band reported.
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 900,
      'max_scroll_depth.percent': 100,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 1000,
    });
    // Part 2 was handed the clamped 900, so the 960 never reaches a second log.
    expect(logs[1].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 900,
      'max_scroll_depth.did_scroll': false,
    });
  });

  it('does not leak the ratchet across a disabled gap', () => {
    scroll({ scrollY: 900, viewportHeight: 100, documentHeight: 1000 }); // furthest point reached this part
    scroll({ scrollY: 50, viewportHeight: 100, documentHeight: 1000 }); // user scrolls back up before disabling
    instrumentation.disable();
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    }); // disabled: no listener, no log

    // The user keeps scrolling while disabled. Real events here also prove the
    // listener is gone: neither the 900 already tracked, nor the 700, nor the
    // disable-time 50 may be credited to the next part.
    scroll({ scrollY: 700, viewportHeight: 100, documentHeight: 1000 });
    scroll({ scrollY: 20, viewportHeight: 100, documentHeight: 1000 });

    // Part 2: re-enabled, the user stays put at 20 for the whole part.
    userSessionManager.startSessionPartInternal({ reason: 'init' });
    instrumentation.enable();
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 20,
      'max_scroll_depth.percent': 2,
      'max_scroll_depth.did_scroll': false,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('does not leak part state into the next session part when measureDocument throws', () => {
    scroll({ scrollY: 900, viewportHeight: 100, documentHeight: 1000 }); // furthest point reached this part
    scroll({ scrollY: 100, viewportHeight: 100, documentHeight: 1000 }); // user scrolls back up before the part ends
    failNextMeasurement();
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    // The failed measurement produced no log, but the reset must still have run.
    userSessionManager.startSessionPartInternal({ reason: 'init' });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 100,
      'max_scroll_depth.percent': 11,
      'max_scroll_depth.did_scroll': false,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('clamps a rubber-band negative scroll position to the top, including across part ends', () => {
    // Safari reports a negative scroll position during rubber-band overscroll
    // past the top of the document, which is still the top.
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollY
    scroll({ scrollY: -50, viewportHeight: 100, documentHeight: 1000 });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    // A second part ending while still overscrolled: the depth carried over
    // from the previous part must be the top, not the negative offset.
    userSessionManager.startSessionPartInternal({ reason: 'init' });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(2);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 0,
      'max_scroll_depth.percent': 0,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 1000,
    });
    expect(logs[1].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 0,
      'max_scroll_depth.percent': 0,
      'max_scroll_depth.did_scroll': false,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('reports the reachable bottom on overscroll past it', () => {
    // The position sits past the true bottom (900) but within the document, so
    // the user did reach the bottom and the excess is overscroll, not staleness.
    scroll({ scrollY: 1000, viewportHeight: 100, documentHeight: 1000 });

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    // The reported pixels sit at the true bottom of the scrollable range, not at
    // the overscrolled offset, so percent reaches 100 without being capped.
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 900,
      'max_scroll_depth.percent': 100,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('omits percent when the last reachable position is one pixel past the document', () => {
    // One pixel beyond the whole document is past anything overscroll can reach
    // inside it, which is the boundary the test above sits on the other side of.
    scroll({ scrollY: 1001, viewportHeight: 100, documentHeight: 1000 });

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 1001,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('omits percent when a depth was reached in a document that no longer scrolls', () => {
    scroll({ scrollY: 80, viewportHeight: 100, documentHeight: 300 });
    // The document shrinks to fit the viewport, so it has no range at all. The
    // 80 was reached, so reporting 0 percent beside it would contradict pixels.
    setGeometry({ scrollY: 0, viewportHeight: 100, documentHeight: 100 });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 80,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 100,
    });
  });

  it('takes percent against the document measured at part end when it grew', () => {
    scroll({ scrollY: 450, viewportHeight: 100, documentHeight: 1000 });
    // A feed appends while the part is open. Growth cannot make the range stale,
    // so percent rescales against the larger document rather than being omitted.
    setGeometry({ scrollY: 450, viewportHeight: 100, documentHeight: 3000 });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 450,
      // scrollable range = 3000 - 100 = 2900; 450 / 2900 = 16%
      'max_scroll_depth.percent': 16,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 3000,
    });
  });

  it('keeps the tracked depth when enable is called again mid-part', () => {
    // onEnable seeds the tracked depth, so the base class guard against
    // re-entering it is what stops a redundant enable() erasing an open part.
    scroll({ scrollY: 900, viewportHeight: 100, documentHeight: 1000 });
    scroll({ scrollY: 100, viewportHeight: 100, documentHeight: 1000 });
    instrumentation.enable();
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 900,
      'max_scroll_depth.percent': 100,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('omits percent when the document shrank below the furthest point reached', () => {
    scroll({ scrollY: 1500, viewportHeight: 100, documentHeight: 2000 });
    // The document shrinks before the part ends and the browser rubber-bands the
    // live position past the new bottom (300); the measured range no longer
    // describes the document the user scrolled.
    setGeometry({ scrollY: 380, viewportHeight: 100, documentHeight: 400 });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    // Part 2 ends unmeasurable, so the position carried out of the stale emit is
    // the only thing deciding what it reports.
    userSessionManager.startSessionPartInternal({ reason: 'init' });
    setGeometry({ scrollY: 0, viewportHeight: 0, documentHeight: 400 });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(2);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 1500,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 400,
    });
    // A range too stale to bound the depth at emit still bounds the seed, so the
    // 380 does not carry and part 2 starts from the new bottom.
    expect(logs[1].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 300,
      'max_scroll_depth.did_scroll': false,
    });
  });

  it('omits percent when the document shrank to an unscrollable height', () => {
    scroll({ scrollY: 500, viewportHeight: 100, documentHeight: 1000 });
    // The document now fits the viewport and the browser has clamped the live
    // position to 0; the 500 reached is far beyond a rubber-band, so it is stale.
    setGeometry({ scrollY: 0, viewportHeight: 100, documentHeight: 100 });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 500,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 100,
    });
  });

  it('keeps every attribute when there is no scrolling element', () => {
    // scrollingElement is null in quirks mode when the body is potentially
    // scrollable. <html> stands in for the document there and the window knows
    // the viewport, so the depth stays measurable.
    scroll({ scrollY: 450, viewportHeight: 100, documentHeight: 1000 });
    scrollRootValue = null;

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 450,
      'max_scroll_depth.percent': 50,
      'max_scroll_depth.did_scroll': true,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('omits the unmeasurable keys when the frame renders nothing', () => {
    // A non-rendered or zero-sized frame has no viewport at all: neither the
    // scroll root's client box nor the window reports one, so there is nothing to
    // take a percentage against. The pixel depth comes from window.scrollY, so it
    // is still reported.
    scroll({ scrollY: 450, viewportHeight: 0, documentHeight: 1000 });

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 450,
      'max_scroll_depth.did_scroll': true,
    });
  });

  it('clamps a rubber-band negative position to the top when the frame is unmeasurable', () => {
    // With no measurement to bound the carried position, only the top can be
    // clamped; a part ending mid-bounce must still hand the next one 0, not -50.
    scroll({ scrollY: -50, viewportHeight: 0, documentHeight: 1000 });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    userSessionManager.startSessionPartInternal({ reason: 'init' });
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(2);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 0,
      'max_scroll_depth.did_scroll': true,
    });
    expect(logs[1].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 0,
      'max_scroll_depth.did_scroll': false,
    });
  });

  it('reports the depth of a restored scroll offset the user never scrolled to', () => {
    // The position can already be past 0 with no scroll event delivered to this
    // listener, and that depth was still reached.
    setGeometry({ scrollY: 800, viewportHeight: 100, documentHeight: 1000 });

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 800,
      // scrollable range = 1000 - 100 = 900; 800 / 900 = 89%
      'max_scroll_depth.percent': 89,
      // The depth was restored by the browser, not scrolled to by the user.
      'max_scroll_depth.did_scroll': false,
      'max_scroll_depth.document_height': 1000,
    });
  });

  it('reports 0 percent when the document is shorter than the viewport', () => {
    // In quirks mode <body> can scroll inside itself while the document around it
    // stays put, which leaves the document shorter than the viewport and the
    // raw document-minus-viewport subtraction below zero.
    setGeometry({ scrollY: 0, viewportHeight: 600, documentHeight: 400 });

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 0,
      'max_scroll_depth.percent': 0,
      'max_scroll_depth.did_scroll': false,
      'max_scroll_depth.document_height': 400,
    });
  });

  it('reports 0 percent when the document is not scrollable', () => {
    // The document exactly fills the viewport, leaving no scrollable range.
    setGeometry({ scrollY: 0, viewportHeight: 500, documentHeight: 500 });

    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });

    const logs = getMaxScrollDepthLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.deep.equal({
      'emb.type': 'emb.otel_log',
      'max_scroll_depth.pixels': 0,
      'max_scroll_depth.percent': 0,
      'max_scroll_depth.did_scroll': false,
      'max_scroll_depth.document_height': 500,
    });
  });
});
