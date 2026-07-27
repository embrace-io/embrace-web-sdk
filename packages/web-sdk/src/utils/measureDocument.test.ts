import * as chai from 'chai';
import { measureDocument } from './measureDocument.ts';

const { expect } = chai;

describe('measureDocument', () => {
  // `scrollingElement` is an accessor on Document.prototype, never an own
  // property of the document, so deleting the stub restores the real getter.
  const stubScrollingElement = (value: Element | null) => {
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      get: () => value,
    });
  };

  afterEach(() => {
    Reflect.deleteProperty(document, 'scrollingElement');
  });

  const createScrollRoot = (dimensions: {
    scrollHeight: number;
    scrollWidth: number;
    clientHeight: number;
    clientWidth: number;
  }) => {
    const scrollRoot = document.createElement('div');
    for (const [property, value] of Object.entries(dimensions)) {
      Object.defineProperty(scrollRoot, property, {
        configurable: true,
        get: () => value,
      });
    }

    return scrollRoot;
  };

  it('reads every dimension off the scrolling element', () => {
    stubScrollingElement(
      createScrollRoot({
        scrollHeight: 2400,
        scrollWidth: 1280,
        clientHeight: 800,
        clientWidth: 600,
      }),
    );

    expect(measureDocument()).to.deep.equal({
      documentHeight: 2400,
      documentWidth: 1280,
      viewportHeight: 800,
      viewportWidth: 600,
    });
  });

  it('returns null when the document has no scrolling element', () => {
    stubScrollingElement(null);

    expect(measureDocument()).to.equal(null);
  });

  it('returns null when the scroll root has no layout box', () => {
    stubScrollingElement(
      createScrollRoot({
        scrollHeight: 0,
        scrollWidth: 0,
        clientHeight: 0,
        clientWidth: 0,
      }),
    );

    expect(measureDocument()).to.equal(null);

    // A frame collapsed on one axis only still has no viewport to measure
    // against, so neither dimension may stand in on its own.
    stubScrollingElement(
      createScrollRoot({
        scrollHeight: 4000,
        scrollWidth: 1280,
        clientHeight: 0,
        clientWidth: 1280,
      }),
    );

    expect(measureDocument()).to.equal(null);
  });

  // The branch above is stubbed because measureDocument reads the global
  // document, which the test page keeps in standards mode. This locks the real
  // condition behind that stub.
  it('has no scrolling element in quirks mode with a scrollable body', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);

    try {
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('expected a document inside the frame');
      }

      // Written without a doctype, so the frame parses in quirks mode.
      frameDocument.write('<style>html, body { overflow: auto }</style>');
      frameDocument.close();

      expect(frameDocument.compatMode).to.equal('BackCompat');
      expect(frameDocument.scrollingElement).to.equal(null);
    } finally {
      frame.remove();
    }
  });

  it('measures the live document when nothing is stubbed', () => {
    const spacer = document.createElement('div');
    spacer.style.height = `${window.innerHeight * 3}px`;
    document.body.append(spacer);

    try {
      const measurement = measureDocument();

      // The test document is in standards mode, so it always has a scroll root.
      if (!measurement) {
        throw new Error('expected a scroll root in a standards-mode document');
      }

      // The viewport is the frame the document scrolls inside, so it can never
      // exceed the window, and the spacer makes the document outgrow it.
      expect(measurement.viewportHeight).to.be.at.most(window.innerHeight);
      expect(measurement.viewportWidth).to.be.at.most(window.innerWidth);
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
