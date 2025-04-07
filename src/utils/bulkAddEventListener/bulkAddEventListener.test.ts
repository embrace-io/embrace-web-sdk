import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { bulkAddEventListener } from './bulkAddEventListener.js';

chai.use(sinonChai);

const { expect } = chai;

describe('bulkAddEventListener', () => {
  let target: HTMLElement;
  let callback: sinon.SinonSpy;

  beforeEach(() => {
    target = document.createElement('div');
    callback = sinon.spy();
  });

  it('should add event listeners for all specified events', () => {
    const events = ['click', 'mouseover', 'keydown'];
    bulkAddEventListener({ target, events, callback });

    events.forEach((event, index) => {
      target.dispatchEvent(new Event(event));
      expect(callback.callCount).to.equal(index + 1);
    });
  });

  it('should handle empty events array', () => {
    const events: string[] = [];
    bulkAddEventListener({ target, events, callback });
    // No error should be thrown
  });

  it('should use the same callback for all events', () => {
    const events = ['click', 'mouseover'];
    bulkAddEventListener({ target, events, callback });

    events.forEach(event => {
      target.dispatchEvent(new Event(event));
    });
    expect(callback.callCount).to.equal(2);
  });

  it('should work with window as target', () => {
    const events = ['resize', 'scroll'];
    bulkAddEventListener({ target: window, events, callback });

    events.forEach(event => {
      window.dispatchEvent(new Event(event));
      void expect(callback).to.have.been.called;
    });
  });
});
