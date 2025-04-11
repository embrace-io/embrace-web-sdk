import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { throttle } from './index.js';

chai.use(sinonChai);

const { expect } = chai;

describe('throttle', () => {
  let clock: sinon.SinonFakeTimers;
  let mockFn: sinon.SinonSpy;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    mockFn = sinon.spy();
  });

  afterEach(() => {
    clock.restore();
  });

  it('should call the function immediately on first call', () => {
    const throttledFn = throttle(mockFn, 1000);
    throttledFn();
    void expect(mockFn).to.have.been.calledOnce;
  });

  it('should not call the function again within the timeout period', () => {
    const throttledFn = throttle(mockFn, 1000);
    throttledFn();
    throttledFn();
    void expect(mockFn).to.have.been.calledOnce;
  });

  it('should call the function again after timeout period', () => {
    const throttledFn = throttle(mockFn, 1000);
    throttledFn();
    clock.tick(1000);
    throttledFn();
    void expect(mockFn).to.have.been.calledTwice;
  });

  it('should pass arguments to the wrapped function', () => {
    const throttledFn = throttle(mockFn, 1000);
    throttledFn('test', 123);
    expect(mockFn).to.have.been.calledWith('test', 123);
  });

  it('should use default timeout of 1000ms', () => {
    const throttledFn = throttle(mockFn);
    throttledFn();
    clock.tick(999);
    throttledFn();
    void expect(mockFn).to.have.been.calledOnce;
    clock.tick(1);
    throttledFn();
    void expect(mockFn).to.have.been.calledTwice;
  });
});
