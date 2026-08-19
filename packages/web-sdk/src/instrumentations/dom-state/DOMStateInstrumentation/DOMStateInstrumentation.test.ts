import { SeverityNumber } from '@opentelemetry/api-logs';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import {
  setupTestLogExporter,
  setupTestStorage,
  setupTestTraceExporter,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../../tests/utils/index.ts';
import { session } from '../../../api-sessions/index.ts';
import { NoOpUserSessionManager } from '../../../api-sessions/manager/NoOpUserSessionManager/index.ts';
import type { UserSessionManagerInternal } from '../../../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceUserSessionManager,
} from '../../../managers/index.ts';
import { OTelPerformanceManager } from '../../../utils/index.ts';
import { DOMStateInstrumentation } from './DOMStateInstrumentation.ts';

const { expect } = chai;

// Oracle for element count + average depth: recursive where production uses an
// iterative stack, and rooted at document.documentElement literally rather than
// through production's root selection, so drift in either the math or the root
// surfaces as a mismatch. The root sits at depth 1.
const measureExpected = (): { count: number; averageDepth: number } => {
  let count = 0;
  let totalDepth = 0;
  const walk = (element: Element, depth: number): void => {
    count++;
    totalDepth += depth;
    for (const child of Array.from(element.children)) {
      walk(child, depth + 1);
    }
  };
  walk(document.documentElement, 1);
  return { count, averageDepth: totalDepth / count };
};

interface StubbedRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

describe('DOMStateInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let userSessionManager: UserSessionManagerInternal;
  let instrumentation: DOMStateInstrumentation | undefined;

  let restorers: Array<() => void> = [];
  let appendedImages: HTMLImageElement[] = [];

  const stubProp = (target: object, prop: string, get: () => unknown) => {
    const original = Object.getOwnPropertyDescriptor(target, prop);
    Object.defineProperty(target, prop, { configurable: true, get });
    restorers.push(() => {
      if (original) {
        Object.defineProperty(target, prop, original);
      } else {
        Reflect.deleteProperty(target, prop);
      }
    });
  };

  // The document size is shadowed on the real document root, which has to stay in
  // place because the tree traversal walks it. A detached element stands in for
  // document.scrollingElement so the viewport cannot coincide with that root's
  // own box: in this standards-mode document, scrollingElement *is* that root.
  // The stubs read the returned object live, so a test can change the geometry
  // between capture points and tell measurements apart by their values.
  const stubGeometry = (geometry: {
    documentHeight: number;
    documentWidth: number;
    viewportHeight: number;
    viewportWidth: number;
  }) => {
    stubProp(
      document.documentElement,
      'scrollHeight',
      () => geometry.documentHeight,
    );
    stubProp(
      document.documentElement,
      'scrollWidth',
      () => geometry.documentWidth,
    );
    const scrollRoot = document.createElement('div');
    // measureDocument reads the document box off scrollingElement when one
    // exists, so the stub root has to agree with documentElement on it too.
    stubProp(scrollRoot, 'scrollHeight', () => geometry.documentHeight);
    stubProp(scrollRoot, 'scrollWidth', () => geometry.documentWidth);
    stubProp(scrollRoot, 'clientHeight', () => geometry.viewportHeight);
    stubProp(scrollRoot, 'clientWidth', () => geometry.viewportWidth);
    stubProp(document, 'scrollingElement', () => scrollRoot);
    return geometry;
  };

  // Serves a stand-in navigation entry, or none at all, so a test can pin what
  // the load-event read sees. @web/test-runner drives tests long after its own
  // load event, so every case but that one has to be stubbed. Other entry types
  // pass through.
  const stubNavigationEntry = (
    navigation: Partial<PerformanceNavigationTiming> | null,
  ): void => {
    const realEntries = Performance.prototype.getEntriesByType.bind(
      window.performance,
    );
    const entries = navigation
      ? [navigation as PerformanceNavigationTiming]
      : [];
    stubProp(
      window.performance,
      'getEntriesByType',
      () =>
        (type: string): PerformanceEntry[] =>
          type === 'navigation' ? entries : realEntries(type),
    );
  };

  // A page whose load event has not fired yet. Readiness is no help: it turns
  // 'complete' in the same task, just before the event dispatches.
  const stubPendingLoadEvent = (): void =>
    stubNavigationEntry({ loadEventStart: 0, loadEventEnd: 0 });

  const addImage = (rect: StubbedRect): void => {
    const image = document.createElement('img');
    image.getBoundingClientRect = () =>
      ({ ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(image);
    appendedImages.push(image);
  };

  const createInstrumentation = (): void => {
    instrumentation = new DOMStateInstrumentation();
    instrumentation.setUserSessionManager(userSessionManager);
  };

  // Nothing is emitted until a part ends: each part end sends one log, and the
  // first one after the fold capture carries the images_above_fold keys.
  const endSessionPart = (): void => {
    userSessionManager.endSessionPartInternal({
      reason: 'web_foreground_inactivity',
    });
  };

  const getDomStateLogs = () =>
    memoryExporter
      .getFinishedLogRecords()
      .filter((l) => l.eventName === 'dom-state');

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
    instrumentation = undefined;
    restorers = [];
    appendedImages = [];
  });

  afterEach(() => {
    // Tests that register a manager on the global proxy must not leak it into
    // the construction-time capture of later tests.
    session.setGlobalUserSessionManager(new NoOpUserSessionManager());
    instrumentation?.disable();
    for (const restore of restorers) {
      restore();
    }
    restorers = [];
    for (const image of appendedImages) {
      image.remove();
    }
    appendedImages = [];
  });

  it('emits nothing until the part ends, then one log carrying both measurements', () => {
    // @web/test-runner drives tests after the load event, so the navigation
    // entry already reports it and the fold capture happens at wiring time.
    expect(
      (
        performance.getEntriesByType(
          'navigation',
        ) as PerformanceNavigationTiming[]
      )[0].loadEventEnd,
    ).to.be.above(0);
    createInstrumentation();
    expect(getDomStateLogs()).to.have.lengthOf(0);

    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].eventName).to.equal('dom-state');
    expect(logs[0].severityNumber).to.equal(SeverityNumber.INFO);
    expect(logs[0].attributes).to.have.property('emb.type', 'emb.otel_log');
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.count',
    );
    expect(logs[0].attributes).to.have.property('dom_state.element_count');
  });

  it('stamps the fold capture time as an attribute while the log itself is stamped at part end', async () => {
    createInstrumentation();
    // Real elapsed time between capture and part end, so a stamp taken at
    // either moment is tellable from one taken at the other.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const beforePartEnd = performance.timeOrigin + performance.now();
    endSessionPart();

    const logs = getDomStateLogs();
    const captureMillis = logs[0].attributes[
      'dom_state.images_above_fold.timestamp'
    ] as number;
    expect(captureMillis).to.be.a('number');
    expect(captureMillis).to.be.lessThan(beforePartEnd);
    // The hrTime conversion truncates below the millisecond, so allow for it.
    expect(hrTimeToMilliseconds(logs[0].hrTime)).to.be.at.least(
      Math.floor(beforePartEnd),
    );
  });

  it('reports document dimensions from the document root', () => {
    stubGeometry({
      documentHeight: 2400,
      documentWidth: 1280,
      viewportHeight: 800,
      viewportWidth: 600,
    });
    createInstrumentation();
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs[0].attributes).to.have.property(
      'dom_state.document_height',
      2400,
    );
    expect(logs[0].attributes).to.have.property(
      'dom_state.document_width',
      1280,
    );
  });

  it('reports the viewport size seen at the fold capture', () => {
    stubGeometry({
      documentHeight: 2400,
      documentWidth: 1280,
      viewportHeight: 800,
      viewportWidth: 600,
    });
    createInstrumentation();
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.viewport_height',
      800,
    );
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.viewport_width',
      600,
    );
  });

  it('reports element count and average depth over the document root', () => {
    const expected = measureExpected();
    createInstrumentation();
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs[0].attributes).to.have.property(
      'dom_state.element_count',
      expected.count,
    );
    expect(logs[0].attributes).to.have.property(
      'dom_state.average_depth',
      expected.averageDepth,
    );
  });

  it('keeps the document size when there is no scrolling element', () => {
    // scrollingElement is null in quirks mode when the body is potentially
    // scrollable. The document root still spans the scrollable document, so its
    // size is measured off that rather than reported absent.
    stubProp(document.documentElement, 'scrollHeight', () => 2400);
    stubProp(document.documentElement, 'scrollWidth', () => 1280);
    stubProp(document, 'scrollingElement', () => null);
    const expected = measureExpected();
    createInstrumentation();
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs[0].attributes).to.have.property(
      'dom_state.document_height',
      2400,
    );
    expect(logs[0].attributes).to.have.property(
      'dom_state.document_width',
      1280,
    );
    // Neither the tree shape nor the fold depends on anything scrolling, so both
    // still report.
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.count',
    );
    expect(logs[0].attributes).to.have.property(
      'dom_state.element_count',
      expected.count,
    );
    expect(logs[0].attributes).to.have.property(
      'dom_state.average_depth',
      expected.averageDepth,
    );
  });

  it('measures the fold against the window when there is no scrolling element', () => {
    stubProp(document, 'scrollingElement', () => null);
    addImage({
      top: 10,
      left: 10,
      bottom: 110,
      right: 110,
      width: 100,
      height: 100,
    }); // inside any real viewport -> counts
    addImage({
      top: 50_000,
      left: 10,
      bottom: 50_100,
      right: 110,
      width: 100,
      height: 100,
    }); // far outside any real viewport -> excluded
    createInstrumentation();
    endSessionPart();

    // A zero-sized fallback viewport would have counted neither.
    const logs = getDomStateLogs();
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.count',
      1,
    );
  });

  it('measures the fold against the scrolling element, not the document root', () => {
    stubGeometry({
      documentHeight: 100_000,
      documentWidth: 100_000,
      viewportHeight: 100_000,
      viewportWidth: 100_000,
    });
    // Far below any real browser viewport, so it can only be counted when the
    // fold came from the stubbed scrolling element.
    addImage({
      top: 50_000,
      left: 10,
      bottom: 50_100,
      right: 110,
      width: 100,
      height: 100,
    });
    createInstrumentation();
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.count',
      1,
    );
  });

  it('omits the document size and the fold keys when nothing renders', () => {
    // A frame that renders nothing has no layout box on the scroll root and none
    // on the window either, so every box-derived key is unmeasurable. There is no
    // view to describe at all, while the tree shape still reports: the document
    // exists whether or not it is rendered.
    stubGeometry({
      documentHeight: 0,
      documentWidth: 0,
      viewportHeight: 0,
      viewportWidth: 0,
    });
    stubProp(window, 'innerHeight', () => 0);
    stubProp(window, 'innerWidth', () => 0);
    addImage({
      top: 10,
      left: 10,
      bottom: 110,
      right: 110,
      width: 100,
      height: 100,
    });
    const expected = measureExpected();
    createInstrumentation();
    endSessionPart();

    // A zero-sized fold would have counted 0 of 1 images, which reads as a real
    // measurement, so no fold key goes out at all.
    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.not.have.property(
      'dom_state.document_height',
    );
    expect(logs[0].attributes).to.not.have.property('dom_state.document_width');
    expect(logs[0].attributes).to.not.have.property(
      'dom_state.images_above_fold.count',
    );
    expect(logs[0].attributes).to.not.have.property(
      'dom_state.images_above_fold.timestamp',
    );
    expect(logs[0].attributes).to.have.property(
      'dom_state.element_count',
      expected.count,
    );
    expect(logs[0].attributes).to.have.property(
      'dom_state.average_depth',
      expected.averageDepth,
    );
  });

  it('measures the fold from the top of the document, not the restored scroll offset', () => {
    // A reload restores the scroll position, so images above the fold can sit
    // above the current viewport by then.
    stubGeometry({
      documentHeight: 5000,
      documentWidth: 1280,
      viewportHeight: 800,
      viewportWidth: 600,
    });
    stubProp(window, 'scrollY', () => 800);
    stubProp(window, 'scrollX', () => 0);
    addImage({
      top: -790,
      left: 10,
      bottom: -690,
      right: 110,
      width: 100,
      height: 100,
    }); // document y 10..110 -> above the fold
    addImage({
      top: -600,
      left: 10,
      bottom: -500,
      right: 110,
      width: 100,
      height: 100,
    }); // document y 200..300 -> above the fold
    addImage({
      top: 100,
      left: 10,
      bottom: 200,
      right: 110,
      width: 100,
      height: 100,
    }); // document y 900..1000 -> visible now, but below the fold
    createInstrumentation();
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.count',
      2,
    );
  });

  it('measures the fold horizontally in document space as well', () => {
    // A restored horizontal scroll offset shifts the viewport-relative rects
    // sideways just as a vertical one shifts them down, so both horizontal
    // bounds have to be judged in document space too.
    stubGeometry({
      documentHeight: 2400,
      documentWidth: 4000,
      viewportHeight: 800,
      viewportWidth: 600,
    });
    stubProp(window, 'scrollY', () => 0);
    stubProp(window, 'scrollX', () => 200);
    addImage({
      top: 10,
      left: 10,
      bottom: 110,
      right: 110,
      width: 100,
      height: 100,
    }); // document x 210..310 -> inside the fold
    addImage({
      top: 10,
      left: -200,
      bottom: 110,
      right: -100,
      width: 100,
      height: 100,
    }); // document x 0..100 -> inside the fold, but only once shifted
    addImage({
      top: 10,
      left: 500,
      bottom: 110,
      right: 600,
      width: 100,
      height: 100,
    }); // document x 700..800 -> visible now, but beyond the fold's right edge
    createInstrumentation();
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.count',
      2,
    );
  });

  it('does not capture from a load event fired while disabled', () => {
    stubPendingLoadEvent();
    createInstrumentation();
    instrumentation?.disable();

    window.dispatchEvent(new Event('load'));

    instrumentation?.enable();
    endSessionPart();

    // The load fired unheard, and re-enabling measured nothing on its own.
    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.not.have.property(
      'dom_state.images_above_fold.count',
    );
  });

  it('counts images overlapping the viewport (any part visible)', () => {
    stubGeometry({
      documentHeight: 2400,
      documentWidth: 1280,
      viewportHeight: 800,
      viewportWidth: 600,
    });
    addImage({
      top: 10,
      left: 10,
      bottom: 110,
      right: 110,
      width: 100,
      height: 100,
    }); // fully visible -> counts
    addImage({
      top: 750,
      left: 10,
      bottom: 850,
      right: 110,
      width: 100,
      height: 100,
    }); // partially below fold -> counts
    addImage({
      top: 900,
      left: 10,
      bottom: 1000,
      right: 110,
      width: 100,
      height: 100,
    }); // fully below fold -> excluded
    addImage({ top: 10, left: 10, bottom: 10, right: 10, width: 0, height: 0 }); // zero-size -> excluded
    createInstrumentation();
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.count',
      2,
    );
  });

  it('attaches the fold keys to the first part end only', () => {
    createInstrumentation();

    endSessionPart();
    userSessionManager.startSessionPartInternal({ reason: 'init' });
    endSessionPart();

    // The fold capture describes what was above the fold when measured, which a
    // part ending later says nothing about.
    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(2);
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.count',
    );
    expect(logs[1].attributes).to.not.have.property(
      'dom_state.images_above_fold.count',
    );
    expect(logs[1].attributes).to.not.have.property(
      'dom_state.images_above_fold.timestamp',
    );
    expect(logs[1].attributes).to.have.property('dom_state.element_count');
  });

  it('still emits the part-end log when the document root is gone', () => {
    // document.documentElement is typed non-nullable but is null once the root
    // element is removed, taking the scroll root with it. The part still ends,
    // so the log goes out carrying only what remains measurable.
    createInstrumentation();
    stubProp(document, 'documentElement', () => null);
    stubProp(document, 'scrollingElement', () => null);

    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    // Nothing to walk and nothing to measure, so no key is fabricated from zero.
    expect(logs[0].attributes).to.not.have.property('dom_state.element_count');
    expect(logs[0].attributes).to.not.have.property('dom_state.average_depth');
    expect(logs[0].attributes).to.not.have.property(
      'dom_state.document_height',
    );
    expect(logs[0].attributes).to.not.have.property('dom_state.document_width');
    // The fold was captured back when the root still existed.
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.count',
    );
  });

  it('spends the fold keys on the part end that fails, not the next one', () => {
    createInstrumentation();
    let scrollHeightThrows = true;
    stubProp(document.documentElement, 'scrollHeight', () => {
      if (scrollHeightThrows) {
        throw new Error('layout read failed');
      }
      return 2400;
    });

    endSessionPart();
    expect(getDomStateLogs()).to.have.lengthOf(0);

    // One bad layout read must not wedge the instrumentation for the rest of
    // the page's life, but the fold capture belonged to the part that failed
    // and must not describe a later one.
    scrollHeightThrows = false;
    userSessionManager.startSessionPartInternal({ reason: 'web_activity' });
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.not.have.property(
      'dom_state.images_above_fold.count',
    );
    expect(logs[0].attributes).to.have.property('dom_state.element_count');
  });

  it('measures when it attaches while the load event is still dispatching', () => {
    // loadEventEnd stays 0 for the whole dispatch, and a load listener added
    // during it never fires, so waiting on one would lose the fold capture for
    // good. Reachable: initSDK called from a window load handler.
    stubNavigationEntry({ loadEventStart: 12, loadEventEnd: 0 });
    createInstrumentation();

    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.count',
    );
  });

  it('measures on readiness alone when the document has no navigation entry', () => {
    // WebKit reports no navigation entry for about:blank and srcdoc documents.
    // Readiness is the only signal there, so the fold capture must not wait on
    // a load event that has already gone by unrecorded.
    stubNavigationEntry(null);
    expect(document.readyState).to.equal('complete');
    createInstrumentation();

    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.count',
    );
  });

  it('captures at the load event when the load event has not fired at attach time', () => {
    // Readiness already reads 'complete' here, ahead of the event, so an
    // instrumentation attaching inside that pre-dispatch gap must still wait
    // for the event rather than call the page loaded and measure immediately.
    expect(document.readyState).to.equal('complete');
    const geometry = stubGeometry({
      documentHeight: 2400,
      documentWidth: 1280,
      viewportHeight: 800,
      viewportWidth: 600,
    });
    stubPendingLoadEvent();
    createInstrumentation();

    // Only a viewport read at the load dispatch can see this value.
    geometry.viewportHeight = 900;
    window.dispatchEvent(new Event('load'));
    expect(getDomStateLogs()).to.have.lengthOf(0); // pending until the part ends

    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.viewport_height',
      900,
    );
  });

  it('carries the fold keys on the next part end when a part ends before load', () => {
    // A part can end before the document finishes loading: the tab goes hidden,
    // or the load never happened inside an engaged part at all (background tab).
    stubPendingLoadEvent();
    createInstrumentation();

    endSessionPart();
    // Only the ending part's own measurement: there is no fold capture yet.
    let logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.not.have.property(
      'dom_state.images_above_fold.count',
    );

    // A part end does not detach the load listener, so the capture still happens.
    userSessionManager.startSessionPartInternal({ reason: 'web_activity' });
    window.dispatchEvent(new Event('load'));
    endSessionPart();

    logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(2);
    expect(logs[1].attributes).to.have.property(
      'dom_state.images_above_fold.count',
    );
  });

  it('defers the fold capture to the part start when the page loads without an engaged part', () => {
    // The background-tab case: no session part is active, so nobody is looking
    // at the page and there is no view worth measuring yet. The first part
    // start is when the user first sees the page, so the fold is measured there.
    const geometry = stubGeometry({
      documentHeight: 2400,
      documentWidth: 1280,
      viewportHeight: 800,
      viewportWidth: 600,
    });
    endSessionPart();
    createInstrumentation();

    geometry.viewportHeight = 900;
    userSessionManager.startSessionPartInternal({ reason: 'foreground' });
    endSessionPart();

    // One log: the first part ended before the instrumentation attached.
    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    // The part-start viewport, proving nothing was measured while the page
    // sat unengaged.
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.viewport_height',
      900,
    );
  });

  it('leaves the capture to the load event when a part starts before the load event fires', () => {
    // Readiness reads 'complete' just before the event dispatches, so a part
    // starting in that pre-dispatch gap is not the deferred first view of a
    // load nobody watched: the load is still to come, and it comes inside
    // this part.
    const geometry = stubGeometry({
      documentHeight: 2400,
      documentWidth: 1280,
      viewportHeight: 800,
      viewportWidth: 600,
    });
    stubPendingLoadEvent();
    endSessionPart();
    createInstrumentation();

    userSessionManager.startSessionPartInternal({ reason: 'foreground' });
    // Only a viewport read at the load dispatch, not the part start, sees this.
    geometry.viewportHeight = 900;
    window.dispatchEvent(new Event('load'));
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.have.property(
      'dom_state.images_above_fold.viewport_height',
      900,
    );
  });

  it('never carries a capture pending before a disable into a part that started while disabled', () => {
    // The listeners keeping the pending capture and the part lifecycle aligned are
    // detached while disabled, so a capture pending across a disable could ride a
    // part that started after it was taken.
    createInstrumentation();
    instrumentation?.disable();
    endSessionPart();
    userSessionManager.startSessionPartInternal({ reason: 'web_activity' });
    instrumentation?.enable();

    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.not.have.property(
      'dom_state.images_above_fold.count',
    );
  });

  it('measures nothing later when the one attempt found no viewport', () => {
    // The page gets a single measurement attempt once a part is engaged. A
    // frame with no viewport spends it on nothing, and there is no retry.
    const geometry = stubGeometry({
      documentHeight: 0,
      documentWidth: 0,
      viewportHeight: 0,
      viewportWidth: 0,
    });
    stubProp(window, 'innerHeight', () => 0);
    stubProp(window, 'innerWidth', () => 0);
    createInstrumentation();
    endSessionPart();
    expect(getDomStateLogs()).to.have.lengthOf(1);

    geometry.documentHeight = 2400;
    geometry.documentWidth = 1280;
    geometry.viewportHeight = 800;
    geometry.viewportWidth = 600;
    userSessionManager.startSessionPartInternal({ reason: 'web_activity' });
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(2);
    expect(logs[0].attributes).to.not.have.property(
      'dom_state.images_above_fold.count',
    );
    expect(logs[1].attributes).to.not.have.property(
      'dom_state.images_above_fold.count',
    );
  });

  it('emits nothing while disabled, even with a fold capture pending', () => {
    createInstrumentation();
    instrumentation?.disable();

    endSessionPart();

    expect(getDomStateLogs()).to.have.lengthOf(0);
  });

  it('drops a pending capture on disable for good', () => {
    // Nothing tracks the part lifecycle while disabled, so a pending capture
    // cannot be trusted to still belong to the active part by re-enable time.
    // The measurement attempt is spent, so nothing re-measures either.
    createInstrumentation();
    instrumentation?.disable();
    instrumentation?.enable();

    endSessionPart();
    userSessionManager.startSessionPartInternal({ reason: 'web_activity' });
    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(2);
    expect(logs[0].attributes).to.not.have.property(
      'dom_state.images_above_fold.count',
    );
    expect(logs[1].attributes).to.not.have.property(
      'dom_state.images_above_fold.count',
    );
  });

  it('takes one fold measurement per page, not one per enable', () => {
    createInstrumentation();
    endSessionPart();

    instrumentation?.disable();
    instrumentation?.enable();
    userSessionManager.startSessionPartInternal({ reason: 'init' });
    endSessionPart();

    const foldLogs = getDomStateLogs().filter(
      (l) => 'dom_state.images_above_fold.count' in l.attributes,
    );
    expect(foldLogs).to.have.lengthOf(1);
  });

  it('contains a throw from the injected diag logger instead of escaping the constructor', () => {
    // At construction the per-instance manager has not arrived, so the capture
    // attempt takes the no-engaged-part skip, which logs through the injected
    // diag: caller code, whose throw would otherwise abort SDK init.
    let capturedErrors = 0;
    const throwingDiag = {
      verbose: () => {},
      debug: () => {
        throw new Error('diag debug failed');
      },
      info: () => {},
      warn: () => {},
      error: () => {
        capturedErrors++;
      },
    };
    expect(() => {
      instrumentation = new DOMStateInstrumentation({ diag: throwingDiag });
    }).to.not.throw();
    expect(capturedErrors).to.equal(1);
  });

  it('contains a layout-read throw during the load-event capture and still emits the part-end log', () => {
    stubPendingLoadEvent();
    createInstrumentation();

    // Throws once, at the capture inside the load dispatch, where no upstream
    // net exists; the part-end measurement afterwards reads normally.
    let threw = false;
    stubProp(document.documentElement, 'scrollHeight', () => {
      if (!threw) {
        threw = true;
        throw new Error('layout read failed');
      }
      return 2400;
    });
    window.dispatchEvent(new Event('load'));

    endSessionPart();

    const logs = getDomStateLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].attributes).to.have.property('dom_state.element_count');
    expect(logs[0].attributes).to.not.have.property(
      'dom_state.images_above_fold.count',
    );
  });
});
