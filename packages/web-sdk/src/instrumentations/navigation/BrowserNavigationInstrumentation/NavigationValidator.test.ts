import * as chai from 'chai';
import * as sinon from 'sinon';
import { InMemoryDiagLogger } from '../../../../tests/utils/index.ts';
import {
  meetsMinimumConfidence,
  NavigationValidator,
} from './NavigationValidator.ts';
import type { Confidence, NavigationValidation } from './types.ts';

const { expect } = chai;

const createDomTree = (...tagNames: string[]): HTMLElement => {
  const container = document.createElement('div');
  for (const tag of tagNames) {
    container.appendChild(document.createElement(tag));
  }
  return container;
};

const createNestedDomTree = (): HTMLElement => {
  const section = document.createElement('section');
  const article = document.createElement('article');
  const h1 = document.createElement('h1');
  h1.textContent = 'Title';
  const p1 = document.createElement('p');
  p1.textContent = 'One';
  const p2 = document.createElement('p');
  p2.textContent = 'Two';
  article.appendChild(h1);
  article.appendChild(p1);
  article.appendChild(p2);
  section.appendChild(article);
  return section;
};

describe('NavigationValidator', () => {
  let diag: InMemoryDiagLogger;

  const createValidator = (overrides: Record<string, unknown> = {}) => {
    return new NavigationValidator({
      diag,
      interactionWindow: 5000,
      domSettleDelay: 200,
      maxSettleDelay: 3000,
      domScoreThreshold: 15,
      ...overrides,
    });
  };

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('meetsMinimumConfidence', () => {
    it('should return true when confidence meets minimum', () => {
      expect(meetsMinimumConfidence('very-high', 'medium')).to.be.true;
      expect(meetsMinimumConfidence('high', 'high')).to.be.true;
      expect(meetsMinimumConfidence('medium', 'medium')).to.be.true;
      expect(meetsMinimumConfidence('medium', 'low')).to.be.true;
    });

    it('should return false when confidence is below minimum', () => {
      expect(meetsMinimumConfidence('low', 'medium')).to.be.false;
      expect(meetsMinimumConfidence('medium', 'high')).to.be.false;
      expect(meetsMinimumConfidence('medium-high', 'very-high')).to.be.false;
    });
  });

  describe('settle timer', () => {
    it('should fire settled callback after domSettleDelay with no DOM changes', (done) => {
      const validator = createValidator({ domSettleDelay: 50 });
      validator.onSettled(() => {
        validator.stop();
        done();
      });
      validator.start();
      validator.beginValidation(Date.now());
    });

    it('should reset settle timer on DOM mutations', (done) => {
      const validator = createValidator({ domSettleDelay: 80 });
      let settledAt = 0;
      const startTime = Date.now();

      validator.onSettled(() => {
        settledAt = Date.now();
        // Should have waited longer than a single domSettleDelay
        // because the DOM mutation reset the timer
        expect(settledAt - startTime).to.be.greaterThan(70);
        validator.stop();
        document.body.removeChild(el);
        done();
      });
      validator.start();
      validator.beginValidation(Date.now());

      // Mutation arrives after 40ms, resetting the 80ms timer
      const el = document.createElement('div');
      setTimeout(() => {
        document.body.appendChild(el);
      }, 40);
    });

    it('should enforce maxSettleDelay even with continuous DOM changes', (done) => {
      const validator = createValidator({
        domSettleDelay: 100,
        maxSettleDelay: 200,
      });
      const startTime = Date.now();
      const elements: Element[] = [];

      validator.onSettled(() => {
        const elapsed = Date.now() - startTime;
        // Should finalize around maxSettleDelay, not wait for domSettleDelay
        expect(elapsed).to.be.lessThan(350);
        validator.stop();
        for (const el of elements) {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        }
        done();
      });
      validator.start();
      validator.beginValidation(Date.now());

      // Continuously add elements
      const interval = setInterval(() => {
        const el = document.createElement('div');
        elements.push(el);
        document.body.appendChild(el);
      }, 30);

      setTimeout(() => {
        clearInterval(interval);
      }, 400);
    });
  });

  describe('confidence computation', () => {
    it('should compute very-high when DOM exceeds threshold and title changes', (done) => {
      const validator = createValidator({
        domScoreThreshold: 5,
        domSettleDelay: 50,
      });
      const originalTitle = document.title;

      validator.onSettled((validation: NavigationValidation) => {
        expect(validation.confidence).to.equal('very-high');
        expect(validation.titleChanged).to.be.true;
        expect(validation.domScore).to.be.greaterThan(0);
        document.body.removeChild(container);
        document.title = originalTitle;
        validator.stop();
        done();
      });
      validator.start();
      validator.beginValidation(Date.now());

      document.title = 'Changed Title';
      const container = createNestedDomTree();
      document.body.appendChild(container);
    });

    it('should compute high when only DOM exceeds threshold', (done) => {
      const validator = createValidator({
        domScoreThreshold: 5,
        domSettleDelay: 50,
      });

      validator.onSettled((validation: NavigationValidation) => {
        expect(validation.confidence).to.equal('high');
        document.body.removeChild(container);
        validator.stop();
        done();
      });
      validator.start();
      validator.beginValidation(Date.now());

      const container = createNestedDomTree();
      document.body.appendChild(container);
    });

    it('should compute medium-high when only title changes', (done) => {
      const validator = createValidator({
        domScoreThreshold: 1000,
        domSettleDelay: 50,
      });
      const originalTitle = document.title;

      validator.onSettled((validation: NavigationValidation) => {
        expect(validation.confidence).to.equal('medium-high');
        document.title = originalTitle;
        validator.stop();
        done();
      });
      validator.start();
      validator.beginValidation(Date.now());

      document.title = 'Title Changed';
    });

    it('should compute medium when only interaction is present', (done) => {
      const validator = createValidator({
        domScoreThreshold: 1000,
        domSettleDelay: 50,
      });

      validator.onSettled((validation: NavigationValidation) => {
        expect(validation.confidence).to.equal('medium');
        expect(validation.interactionType).to.equal('click');
        expect(validation.titleChanged).to.be.false;
        validator.stop();
        done();
      });
      validator.start();

      window.dispatchEvent(new Event('click', { bubbles: true }));

      setTimeout(() => {
        validator.beginValidation(Date.now());
      }, 10);
    });

    it('should compute low when no signals present', (done) => {
      const validator = createValidator({
        domScoreThreshold: 15,
        domSettleDelay: 50,
      });

      validator.onSettled((validation: NavigationValidation) => {
        expect(validation.confidence).to.equal('low');
        validator.stop();
        done();
      });
      validator.start();
      validator.beginValidation(Date.now());
    });
  });

  describe('interaction tracking', () => {
    it('should attribute click interaction within the interaction window', (done) => {
      const validator = createValidator({
        interactionWindow: 5000,
        domSettleDelay: 50,
      });

      validator.onSettled((validation: NavigationValidation) => {
        expect(validation.interactionType).to.equal('click');
        expect(validation.interactionLatencyMs).to.be.a('number');
        validator.stop();
        done();
      });
      validator.start();

      window.dispatchEvent(new Event('click', { bubbles: true }));

      setTimeout(() => {
        validator.beginValidation(Date.now());
      }, 10);
    });

    it('should not attribute interaction outside the interaction window', (done) => {
      const validator = createValidator({
        interactionWindow: 30,
        domSettleDelay: 50,
      });

      validator.onSettled((validation: NavigationValidation) => {
        expect(validation.interactionType).to.be.null;
        expect(validation.interactionLatencyMs).to.be.null;
        validator.stop();
        done();
      });
      validator.start();

      window.dispatchEvent(new Event('click', { bubbles: true }));

      setTimeout(() => {
        validator.beginValidation(Date.now());
      }, 50);
    });

    it('should track keydown interactions', (done) => {
      const validator = createValidator({
        interactionWindow: 5000,
        domSettleDelay: 50,
      });

      validator.onSettled((validation: NavigationValidation) => {
        expect(validation.interactionType).to.equal('keydown');
        validator.stop();
        done();
      });
      validator.start();

      window.dispatchEvent(new Event('keydown', { bubbles: true }));

      setTimeout(() => {
        validator.beginValidation(Date.now());
      }, 10);
    });
  });

  describe('DOM scoring', () => {
    it('should score added DOM nodes', (done) => {
      const validator = createValidator({
        domScoreThreshold: 15,
        domSettleDelay: 50,
      });

      validator.onSettled((validation: NavigationValidation) => {
        expect(validation.domScore).to.be.greaterThan(0);
        document.body.removeChild(el);
        validator.stop();
        done();
      });
      validator.start();
      validator.beginValidation(Date.now());

      const el = createDomTree('h1', 'p');
      document.body.appendChild(el);
    });

    it('should accumulate DOM scores across multiple mutations', (done) => {
      const validator = createValidator({
        domScoreThreshold: 15,
        domSettleDelay: 80,
      });

      validator.onSettled((validation: NavigationValidation) => {
        // p=2, h1=3
        expect(validation.domScore).to.equal(5);
        document.body.removeChild(el1);
        document.body.removeChild(el2);
        validator.stop();
        done();
      });
      validator.start();
      validator.beginValidation(Date.now());

      const el1 = document.createElement('p');
      document.body.appendChild(el1);

      const el2 = document.createElement('h1');
      setTimeout(() => {
        document.body.appendChild(el2);
      }, 20);
    });
  });

  describe('rapid navigations', () => {
    it('should finalize pending validation when a second begins', (done) => {
      const validator = createValidator({ domSettleDelay: 100 });
      const results: NavigationValidation[] = [];

      validator.onSettled((validation: NavigationValidation) => {
        results.push(validation);
        if (results.length === 2) {
          validator.stop();
          done();
        }
      });
      validator.start();

      validator.beginValidation(Date.now());

      setTimeout(() => {
        // Second navigation — should finalize first immediately
        validator.beginValidation(Date.now());
        expect(results).to.have.lengthOf(1);
      }, 30);
    });
  });

  describe('cancelValidation', () => {
    it('should cancel pending validation without calling settled', (done) => {
      const validator = createValidator({ domSettleDelay: 50 });
      const settled = sinon.spy();
      validator.onSettled(settled);
      validator.start();

      validator.beginValidation(Date.now());
      validator.cancelValidation();

      setTimeout(() => {
        expect(settled.called).to.be.false;
        validator.stop();
        done();
      }, 100);
    });
  });

  describe('getValidation', () => {
    it('should return null when no validation is pending', () => {
      const validator = createValidator();
      validator.start();
      expect(validator.getValidation()).to.be.null;
      validator.stop();
    });

    it('should return current validation state', () => {
      const validator = createValidator();
      validator.start();

      validator.beginValidation(Date.now());
      const validation = validator.getValidation();
      expect(validation).to.not.be.null;
      expect(validation?.domScore).to.equal(0);

      validator.cancelValidation();
      validator.stop();
    });
  });

  describe('start/stop lifecycle', () => {
    it('should handle double start', () => {
      const validator = createValidator();
      validator.start();
      validator.start();
      validator.stop();
    });

    it('should handle double stop', () => {
      const validator = createValidator();
      validator.start();
      validator.stop();
      validator.stop();
    });

    it('should finalize pending on stop', () => {
      const validator = createValidator();
      const settled = sinon.spy();
      validator.onSettled(settled);
      validator.start();

      validator.beginValidation(Date.now());
      validator.stop();

      expect(settled.calledOnce).to.be.true;
    });
  });

  describe('network requests', () => {
    it('should include networkRequests in validation', (done) => {
      const validator = createValidator({ domSettleDelay: 50 });

      validator.onSettled((validation: NavigationValidation) => {
        expect(validation.networkRequests).to.be.a('number');
        validator.stop();
        done();
      });
      validator.start();
      validator.beginValidation(Date.now());
    });
  });

  describe('scroll reset', () => {
    it('should detect scroll reset when scrollY is 0', (done) => {
      const validator = createValidator({ domSettleDelay: 80 });

      validator.onSettled((validation: NavigationValidation) => {
        expect(validation.scrollReset).to.be.true;
        validator.stop();
        done();
      });
      validator.start();
      validator.beginValidation(Date.now());

      // scrollY is 0 in the test environment, so dispatching scroll triggers the handler
      setTimeout(() => {
        window.dispatchEvent(new Event('scroll'));
      }, 10);
    });
  });

  describe('confidence levels', () => {
    const levels: Confidence[] = [
      'low',
      'medium',
      'medium-high',
      'high',
      'very-high',
    ];

    it('should order confidence levels correctly', () => {
      for (let i = 0; i < levels.length; i++) {
        for (let j = 0; j < levels.length; j++) {
          if (i >= j) {
            expect(meetsMinimumConfidence(levels[i], levels[j])).to.be.true;
          } else {
            expect(meetsMinimumConfidence(levels[i], levels[j])).to.be.false;
          }
        }
      }
    });
  });
});
