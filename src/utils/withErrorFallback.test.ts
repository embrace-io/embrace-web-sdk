import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { withErrorFallback } from './withErrorFallback.js';
import { InMemoryDiagLogger } from '../testUtils/index.js';

chai.use(sinonChai);

const { expect } = chai;

describe('withErrorFallback', () => {
  it('should return the function result when successful', () => {
    const mockFn = (x: number) => x * 2;
    const wrappedFn = withErrorFallback(mockFn, 0);
    expect(wrappedFn(5)).to.equal(10);
  });

  it('should return default value when function throws', () => {
    const mockFn = () => {
      throw new Error('Test error');
    };
    const wrappedFn = withErrorFallback(mockFn, 'default');
    expect(wrappedFn()).to.equal('default');
  });

  it('should log error when silent is false', () => {
    const mockFn = () => {
      throw new Error('Test error');
    };
    const consoleErrorStub = sinon.stub(console, 'error');
    const wrappedFn = withErrorFallback(mockFn, 'default', false);
    wrappedFn();
    void expect(consoleErrorStub).to.have.been.calledOnce;
    consoleErrorStub.restore();
  });

  it('should not log error when silent is true', () => {
    const mockFn = () => {
      throw new Error('Test error');
    };
    const consoleErrorStub = sinon.stub(console, 'error');
    const wrappedFn = withErrorFallback(mockFn, 'default', true);
    wrappedFn();
    void expect(consoleErrorStub).to.not.have.been.called;
    consoleErrorStub.restore();
  });

  it('should handle multiple arguments', () => {
    const mockFn = (a: number, b: number) => a + b;
    const wrappedFn = withErrorFallback(mockFn, 0);
    expect(wrappedFn(2, 3)).to.equal(5);
  });

  it('should log to a DiagLogger when provided', () => {
    const diag = new InMemoryDiagLogger();
    const mockFn = () => {
      throw new Error('Test error');
    };
    const wrappedFn = withErrorFallback(mockFn, 'default', false, diag);
    wrappedFn();
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.equal('Test error');
  });

  it('should not log to the provided DiagLogger when silent is true', () => {
    const diag = new InMemoryDiagLogger();
    const mockFn = () => {
      throw new Error('Test error');
    };
    const wrappedFn = withErrorFallback(mockFn, 'default', true, diag);
    wrappedFn();
    expect(diag.getErrorLogs()).to.have.lengthOf(0);
  });
});
