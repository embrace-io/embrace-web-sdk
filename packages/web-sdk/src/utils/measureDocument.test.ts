import * as chai from 'chai';
import type { DocumentMeasurement } from './measureDocument.ts';
import { measureDocument } from './measureDocument.ts';

const { expect } = chai;

/*
  Slack for the assertions that the reported viewport tracks the window box. A
  fractional devicePixelRatio leaves a fractional CSS-pixel viewport that the
  window getters and the client-box getters round in opposite directions, so on
  the emulated mobile configs the reported viewport can come out a pixel larger
  than the window box. Which axis it lands on varies by engine and version, and
  the assertions print the values they saw.
*/
const ROUNDING_SLACK_PX = 1;

describe('measureDocument', () => {
  const restorers: Array<() => void> = [];

  // Some of these are accessors on a prototype (`scrollingElement`,
  // `scrollHeight`) and some are own properties of the window (`innerHeight`),
  // so the original descriptor is put back where there was one and the shadowing
  // own property is deleted where there was not.
  const stubProp = (target: object, property: string, get: () => unknown) => {
    const original = Object.getOwnPropertyDescriptor(target, property);
    Object.defineProperty(target, property, { configurable: true, get });
    restorers.push(() => {
      if (original) {
        Object.defineProperty(target, property, original);
      } else {
        Reflect.deleteProperty(target, property);
      }
    });
  };

  afterEach(() => {
    for (const restore of restorers) {
      restore();
    }
    restorers.length = 0;
  });

  // The document root measures the document only where there is no scroll root,
  // so cases that stub one give it its own scroll box as well.
  const stubDocumentSize = (scrollHeight: number, scrollWidth: number) => {
    stubProp(document.documentElement, 'scrollHeight', () => scrollHeight);
    stubProp(document.documentElement, 'scrollWidth', () => scrollWidth);
  };

  // A detached element stands in for the scrolling element so the boxes read off
  // it cannot coincide with the real document root's: in this standards-mode
  // document, scrollingElement *is* that root.
  const stubScrollRoot = (
    boxes: {
      clientHeight: number;
      clientWidth: number;
      scrollHeight: number;
      scrollWidth: number;
    } | null,
  ) => {
    if (boxes === null) {
      stubProp(document, 'scrollingElement', () => null);
      return;
    }

    const scrollRoot = document.createElement('div');
    stubProp(scrollRoot, 'clientHeight', () => boxes.clientHeight);
    stubProp(scrollRoot, 'clientWidth', () => boxes.clientWidth);
    stubProp(scrollRoot, 'scrollHeight', () => boxes.scrollHeight);
    stubProp(scrollRoot, 'scrollWidth', () => boxes.scrollWidth);
    stubProp(document, 'scrollingElement', () => scrollRoot);
  };

  /*
    Stubbed boxes, so these pin how the pieces are combined: which element each
    side is read from, when the window box stands in, and when the whole
    measurement is refused. What the browser actually puts in those boxes is
    covered by the real documents further down.
  */
  describe('composition', () => {
    it('reads both the document and the viewport off the scroll root', () => {
      // The document root carries a different size so a measurement taken off it
      // rather than off the scroll root cannot pass this.
      stubDocumentSize(999, 999);
      stubScrollRoot({
        clientHeight: 800,
        clientWidth: 600,
        scrollHeight: 2400,
        scrollWidth: 1280,
      });

      expect(measureDocument()).to.deep.equal({
        documentHeight: 2400,
        documentWidth: 1280,
        viewportHeight: 800,
        viewportWidth: 600,
        scrollableHeight: 1600,
      });
    });

    it('measures the document off <html> when there is no scroll root', () => {
      // Quirks mode leaves no scroll root when <body> is potentially scrollable,
      // so <html> supplies the document and the window supplies the viewport.
      stubDocumentSize(2400, 1280);
      stubScrollRoot(null);
      stubProp(window, 'innerHeight', () => 800);
      stubProp(window, 'innerWidth', () => 600);

      expect(measureDocument()).to.deep.equal({
        documentHeight: 2400,
        documentWidth: 1280,
        viewportHeight: 800,
        viewportWidth: 600,
        scrollableHeight: 1600,
      });
    });

    it('reports a document smaller than the viewport rather than hiding it', () => {
      // That is a real measurement of a document that does not scroll, not a
      // missing one, and the scrollable range floors at zero rather than going
      // negative.
      stubDocumentSize(400, 1280);
      stubScrollRoot(null);
      stubProp(window, 'innerHeight', () => 600);
      stubProp(window, 'innerWidth', () => 1280);

      expect(measureDocument()).to.deep.equal({
        documentHeight: 400,
        documentWidth: 1280,
        viewportHeight: 600,
        viewportWidth: 1280,
        scrollableHeight: 0,
      });
    });

    it('returns null when the frame renders nothing', () => {
      // What a zero-sized or display:none frame reports in every engine: the
      // scroll root and the window both come back zero.
      stubDocumentSize(0, 0);
      stubScrollRoot({
        clientHeight: 0,
        clientWidth: 0,
        scrollHeight: 0,
        scrollWidth: 0,
      });
      stubProp(window, 'innerHeight', () => 0);
      stubProp(window, 'innerWidth', () => 0);

      expect(measureDocument()).to.equal(null);
    });

    it('measures the live document when nothing is stubbed', () => {
      const spacer = document.createElement('div');
      spacer.style.height = `${window.innerHeight * 3}px`;
      document.body.append(spacer);

      try {
        const measurement = measureDocument();

        // The test page renders, so it always has a viewport.
        if (measurement === null) {
          throw new Error('expected a viewport in a rendered document');
        }

        // Carried on the viewport assertions so a failure says what the engine
        // actually reported, which is the whole question when they disagree.
        const diagnostic = JSON.stringify({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
          devicePixelRatio: window.devicePixelRatio,
        });

        // The viewport is the frame the document scrolls inside, so it tracks
        // the window box, and the spacer makes the document outgrow it.
        expect(measurement.viewportHeight, diagnostic).to.be.at.most(
          window.innerHeight + ROUNDING_SLACK_PX,
        );
        expect(measurement.viewportWidth, diagnostic).to.be.at.most(
          window.innerWidth + ROUNDING_SLACK_PX,
        );
        expect(measurement.documentHeight).to.be.greaterThan(
          measurement.viewportHeight,
        );
        expect(measurement.viewportWidth).to.be.greaterThan(0);
        expect(measurement.documentWidth).to.be.greaterThan(0);
      } finally {
        spacer.remove();
      }
    });
  });

  /*
    Real documents rather than stubbed getters. Every case below builds an actual
    document in an iframe and checks the measurement against what the browser
    itself does, so engine differences surface here instead of in production.

    The load-bearing assertion is `scrollableHeight === maxScrollY`: the range we
    report has to be the range the document can actually scroll through. That is
    the property max-scroll-depth divides by. The fixtures deliberately include
    the shapes where the wrong source element stops satisfying it, since a suite
    built only from reset, in-flow content is one where every element happens to
    agree.
  */
  describe('across document states', () => {
    const frames: HTMLIFrameElement[] = [];

    const FRAME_HEIGHT = 300;
    const FRAME_WIDTH = 400;

    /*
      document.write is used rather than srcdoc because srcdoc always parses in
      standards mode, and rather than a data: src because that gives the frame an
      opaque origin that blocks contentDocument. The markup is static test fixture
      text going into an isolated frame, so none of the usual injection concerns
      with document.write apply.
    */
    const makeDocument = (
      html: string,
      frameStyle = `width:${FRAME_WIDTH}px;height:${FRAME_HEIGHT}px`,
    ): Document => {
      const frame = document.createElement('iframe');
      frame.style.cssText = `border:0;${frameStyle}`;
      document.body.appendChild(frame);
      frames.push(frame);
      /*
        Settle the frame's own box before writing into it. The child document's
        viewport comes from the parent's layout of this element, so writing first
        lays the content out against a provisional viewport and the document keeps
        growing afterwards.
      */
      void frame.offsetHeight;

      const doc = frame.contentDocument;
      if (!doc) {
        throw new Error('iframe document was not reachable');
      }
      doc.open();
      doc.write(html);
      doc.close();
      // Force layout so the measurement reads a settled tree.
      void doc.documentElement.offsetHeight;
      return doc;
    };

    // How far the browser actually lets this document scroll vertically.
    const maxScrollY = (doc: Document): number => {
      const view = doc.defaultView;
      if (!view) {
        throw new Error('document has no browsing context');
      }
      view.scrollTo(0, 1_000_000);
      const reached = view.scrollY;
      view.scrollTo(0, 0);
      return reached;
    };

    /*
      Engines disagree on these primitives, and the disagreements are the whole
      reason this block exists, so every assertion carries them. A failure in CI
      then says what the browser actually reported rather than only which
      expectation broke.
    */
    const state = (doc: Document): string => {
      const view = doc.defaultView;
      const scrollRoot = doc.scrollingElement;
      return JSON.stringify({
        compatMode: doc.compatMode,
        scrollRoot: scrollRoot ? scrollRoot.tagName : null,
        scrollRootClientHeight: scrollRoot ? scrollRoot.clientHeight : null,
        scrollRootClientWidth: scrollRoot ? scrollRoot.clientWidth : null,
        htmlScrollHeight: doc.documentElement.scrollHeight,
        bodyScrollHeight: doc.body ? doc.body.scrollHeight : null,
        innerHeight: view ? view.innerHeight : null,
        innerWidth: view ? view.innerWidth : null,
      });
    };

    // Holds for every measurement the util returns, in every engine.
    const expectSelfConsistent = (
      measurement: DocumentMeasurement,
      doc: Document,
    ): void => {
      const where = state(doc);
      const view = doc.defaultView;
      if (!view) {
        throw new Error('document has no browsing context');
      }

      expect(measurement.viewportHeight, where).to.be.greaterThan(0);
      expect(measurement.viewportWidth, where).to.be.greaterThan(0);
      // The reported viewport tracks the window box: the scroll-root path
      // excludes classic scrollbar space and the window path includes it.
      expect(measurement.viewportHeight, where).to.be.at.most(
        view.innerHeight + ROUNDING_SLACK_PX,
      );
      expect(measurement.viewportWidth, where).to.be.at.most(
        view.innerWidth + ROUNDING_SLACK_PX,
      );
      expect(measurement.scrollableHeight, where).to.equal(
        Math.max(0, measurement.documentHeight - measurement.viewportHeight),
      );
      expect(
        measurement.scrollableHeight,
        `reported scrollable range must match what the document can scroll. ${where}`,
      ).to.equal(maxScrollY(doc));
    };

    const measured = (doc: Document): DocumentMeasurement => {
      const measurement = measureDocument(doc);
      if (!measurement) {
        throw new Error('expected a measurement');
      }
      return measurement;
    };

    const STANDARDS = '<!DOCTYPE html>';
    const RESET = '<style>html,body{margin:0;padding:0}</style>';

    afterEach(() => {
      for (const frame of frames) {
        frame.remove();
      }
      frames.length = 0;
    });

    describe('standards mode', () => {
      it('reports no scrollable range for a document shorter than the viewport', () => {
        const doc = makeDocument(
          `${STANDARDS}${RESET}<body><div style="height:50px"></div></body>`,
        );

        expect(doc.compatMode).to.equal('CSS1Compat');
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight).to.equal(0);
        expect(measurement.viewportHeight).to.equal(FRAME_HEIGHT);
      });

      it('reports the scrollable range for a document taller than the viewport', () => {
        const doc = makeDocument(
          `${STANDARDS}${RESET}<body><div style="height:2000px"></div></body>`,
        );

        expect(doc.compatMode).to.equal('CSS1Compat');
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight).to.be.greaterThan(0);
        expect(measurement.documentHeight).to.be.at.least(2000);
      });

      it('reports no scrollable range when the content is exactly the viewport height', () => {
        const doc = makeDocument(
          `${STANDARDS}${RESET}<body><div style="height:${FRAME_HEIGHT}px"></div></body>`,
        );

        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight).to.equal(0);
      });

      it('reports no vertical range for a document that only overflows horizontally', () => {
        const doc = makeDocument(
          `${STANDARDS}${RESET}<body><div style="width:3000px;height:10px"></div></body>`,
        );

        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight).to.equal(0);
        expect(measurement.documentWidth).to.be.greaterThan(
          measurement.viewportWidth,
        );
      });

      it('measures both axes when the document overflows in both', () => {
        const doc = makeDocument(
          `${STANDARDS}${RESET}<body><div style="width:3000px;height:2000px"></div></body>`,
        );

        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight).to.be.greaterThan(0);
        expect(measurement.documentWidth).to.be.greaterThan(
          measurement.viewportWidth,
        );
      });

      it('matches the real scroll range when the content height is fractional', () => {
        // scrollHeight is an integer while scroll offsets are not, so a fractional
        // document is where a rounding mismatch would show up.
        const doc = makeDocument(
          `${STANDARDS}${RESET}<body><div style="height:1999.5px"></div></body>`,
        );

        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
      });

      it('accounts for the default body margin', () => {
        // No reset, so the UA margin on <body> is part of the document box. Real
        // pages far more often look like this than like the reset cases above.
        const doc = makeDocument(
          `${STANDARDS}<body><div style="height:2000px"></div></body>`,
        );

        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight).to.be.greaterThan(0);
      });

      it('still reports the viewport when the root element is display:none', () => {
        // Every engine keeps reporting the viewport off the root element here,
        // even though display:none otherwise leaves an element with no client box
        // to report at all.
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/clientHeight
        const doc = makeDocument(
          `${STANDARDS}<style>html{display:none}</style><body>hi</body>`,
        );

        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.viewportHeight).to.equal(FRAME_HEIGHT);
      });
    });

    describe('quirks mode', () => {
      it('reports no scrollable range for a document shorter than the viewport', () => {
        const doc = makeDocument(
          `${RESET}<body><div style="height:50px"></div></body>`,
        );

        expect(doc.compatMode).to.equal('BackCompat');
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight).to.equal(0);
      });

      it('reports the scrollable range for a document taller than the viewport', () => {
        const doc = makeDocument(
          `${RESET}<body><div style="height:2000px"></div></body>`,
        );

        expect(doc.compatMode).to.equal('BackCompat');
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight).to.be.greaterThan(0);
      });

      it('accounts for the default body margin', () => {
        const doc = makeDocument(
          '<body><div style="height:2000px"></div></body>',
        );

        expect(doc.compatMode).to.equal('BackCompat');
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight).to.be.greaterThan(0);
      });

      it('covers overflow from out-of-flow content', () => {
        // An absolutely positioned child is laid out against the initial
        // containing block, so it sits outside <html>'s own scrolling area
        // entirely. Only the scroll root's scroll box spans it, and measuring off
        // <html> here reports a document that does not scroll at all.
        const doc = makeDocument(
          `${RESET}<body><div style="position:absolute;top:0;height:2100px;width:10px"></div></body>`,
        );

        expect(doc.compatMode).to.equal('BackCompat');
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight, state(doc)).to.be.greaterThan(0);
      });

      it('never reports a fabricated zero box when the document source comes up empty', () => {
        // Null scroll root (body potentially scrollable on both axes) plus an
        // out-of-flow child, which can leave <html>'s scroll height at zero.
        const doc = makeDocument(
          `${RESET}<style>html{overflow:auto}body{overflow:auto}</style><body><div style="position:absolute;top:0;height:2100px;width:10px"></div></body>`,
        );

        expect(doc.compatMode).to.equal('BackCompat');
        expect(doc.scrollingElement).to.equal(null);
        const measurement = measureDocument(doc);
        if (measurement === null) {
          return;
        }

        expect(measurement.documentHeight, state(doc)).to.be.greaterThan(0);
        expect(measurement.documentWidth, state(doc)).to.be.greaterThan(0);
        expect(measurement.viewportHeight, state(doc)).to.be.greaterThan(0);
        expect(measurement.viewportWidth, state(doc)).to.be.greaterThan(0);
      });

      it("covers <html>'s own margin", () => {
        // <html>'s scrolling area excludes its own margin, so measuring the
        // document off <html> comes up short by exactly that margin.
        const doc = makeDocument(
          '<style>body{margin:0;padding:0}html{margin:50px;padding:0}</style><body><div style="height:2000px"></div></body>',
        );

        expect(doc.compatMode).to.equal('BackCompat');
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight, state(doc)).to.be.greaterThan(0);
      });

      it("covers <html>'s own border", () => {
        // The same exclusion as the margin case, on the border edge.
        const doc = makeDocument(
          '<style>body{margin:0;padding:0}html{border:20px solid;padding:0}</style><body><div style="height:2000px"></div></body>',
        );

        expect(doc.compatMode).to.equal('BackCompat');
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight, state(doc)).to.be.greaterThan(0);
      });

      it('measures the viewport off <body>, which is the scroll root here', () => {
        const doc = makeDocument(
          `${RESET}<body><div style="height:2000px"></div></body>`,
        );

        expect(doc.scrollingElement).to.equal(doc.body);
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
      });

      it('falls back to the window when <body> is potentially scrollable', () => {
        // <html> overflow must be non-visible so the body's overflow does not
        // propagate to the viewport, which is what makes <body> potentially
        // scrollable and leaves scrollingElement null.
        // https://drafts.csswg.org/cssom-view/#potentially-scrollable
        const doc = makeDocument(
          `${RESET}<style>html{overflow:hidden}body{overflow:scroll;height:50px}</style><body><div style="height:2000px"></div></body>`,
        );

        expect(doc.compatMode).to.equal('BackCompat');
        expect(doc.scrollingElement).to.equal(null);
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
      });

      it('keeps the range positive when the body scrolls a tall child inside a constrained <html>', () => {
        // <html> is constrained, but its scroll area still covers the tall child,
        // so the document side stays larger than the viewport here.
        const doc = makeDocument(
          `${RESET}<style>html{overflow:hidden;height:50px}body{overflow:scroll}</style><body><div style="height:2000px"></div></body>`,
        );

        expect(doc.compatMode).to.equal('BackCompat');
        expect(doc.scrollingElement).to.equal(null);
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight).to.be.greaterThan(0);
      });

      it('never reports a negative range when <html> measures shorter than the viewport', () => {
        // The shape the clamp exists for: no scroll root, so the viewport comes
        // from the window, while the document is measured off an <html> that is
        // both constrained and holding nothing tall.
        const doc = makeDocument(
          `${RESET}<style>html{overflow:hidden;height:50px}body{overflow:scroll}</style><body><div style="height:20px"></div></body>`,
        );

        expect(doc.compatMode).to.equal('BackCompat');
        expect(doc.scrollingElement).to.equal(null);
        const measurement = measured(doc);
        expectSelfConsistent(measurement, doc);
        expect(measurement.scrollableHeight).to.equal(0);
        /*
          Engines split here, which is exactly why the clamp lives in the producer
          rather than at each call site. Chromium and Firefox report an <html>
          scroll height shorter than the viewport, so the raw subtraction would go
          negative. WebKit floors it at the viewport, so the same subtraction lands
          on zero. Both are covered by `<=`.
        */
        expect(measurement.documentHeight, state(doc)).to.be.at.most(
          measurement.viewportHeight,
        );
      });
    });

    describe('no viewport', () => {
      it('returns null for a zero-sized frame', () => {
        const doc = makeDocument(
          `${STANDARDS}${RESET}<body><div style="height:2000px"></div></body>`,
          'width:0;height:0',
        );

        expect(measureDocument(doc), state(doc)).to.equal(null);
      });

      it('returns null for a display:none frame', () => {
        const doc = makeDocument(
          `${STANDARDS}${RESET}<body><div style="height:2000px"></div></body>`,
          'display:none',
        );

        expect(measureDocument(doc), state(doc)).to.equal(null);
      });

      it('returns null for a document with no browsing context', () => {
        const detached = document.implementation.createHTMLDocument('detached');

        expect(detached.defaultView).to.equal(null);
        expect(measureDocument(detached)).to.equal(null);
      });

      it('returns null rather than throwing when the root element has been removed', () => {
        const doc = makeDocument(
          `${STANDARDS}${RESET}<body><div style="height:2000px"></div></body>`,
        );
        doc.documentElement.remove();

        expect(doc.scrollingElement).to.equal(null);
        expect(measureDocument(doc)).to.equal(null);
      });
    });
  });
});
