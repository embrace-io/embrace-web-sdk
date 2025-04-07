import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { bulkRemoveEventListener } from './bulkRemoveEventListener.js';

chai.use(sinonChai);

const { expect } = chai;

describe('bulkRemoveEventListener', () => {
  let target: HTMLElement;
  let callback: sinon.SinonSpy;

  beforeEach(() => {
    target = document.createElement('div');
    callback = sinon.spy();
  });

  it('should remove event listeners for all specified events', () => {
    const events = ['click', 'mouseover', 'keydown'];
    // First add the listeners
    events.forEach(event => {
      target.addEventListener(event, callback);
    });

    // Then remove them
    bulkRemoveEventListener({ target, events, callback });

    // Verify they were removed
    events.forEach(event => {
      target.dispatchEvent(new Event(event));
      void expect(callback).to.not.have.been.called;
    });
  });

  it('should handle empty events array', () => {
    const events: string[] = [];
    bulkRemoveEventListener({ target, events, callback });
    // No error should be thrown
  });

  it('should work with window as target', () => {
    const events = ['resize', 'scroll'];
    // First add the listeners
    events.forEach(event => {
      window.addEventListener(event, callback);
    });

    // Then remove them
    bulkRemoveEventListener({ target: window, events, callback });

    // Verify they were removed
    events.forEach(event => {
      window.dispatchEvent(new Event(event));
      void expect(callback).to.not.have.been.called;
    });
  });

  it('should only remove the specified callback', () => {
    const events = ['click'];
    const otherCallback = sinon.spy();

    // Add both callbacks
    target.addEventListener('click', callback);
    target.addEventListener('click', otherCallback);

    // Remove only the first callback
    bulkRemoveEventListener({ target, events, callback });

    // Verify only the specified callback was removed
    target.dispatchEvent(new Event('click'));
    void expect(callback).to.not.have.been.called;
    void expect(otherCallback).to.have.been.called;
  });
});
