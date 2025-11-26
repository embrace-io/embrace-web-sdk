import * as chai from 'chai';
import { InMemoryDiagLogger } from '../../testUtils/index.js';
import { SafeCaller } from './SafeCaller';

const { expect } = chai;

describe('NamespacedStorage', () => {
  let diagLogger: InMemoryDiagLogger;
  let safeCaller: SafeCaller;

  beforeEach(() => {
    diagLogger = new InMemoryDiagLogger();
    safeCaller = new SafeCaller(diagLogger);
  });

  it('should invoke the underlying function', () => {
    let i = 0;
    expect(() => {
      safeCaller.invoke(() => {
        i++;
      });
    }).not.to.throw();
    expect(i).to.equal(1);
    expect(diagLogger.getErrorLogs()).to.deep.equal([]);
  });

  it('should catch any errors thrown by the invoked function', () => {
    expect(() => {
      safeCaller.invoke(() => {
        throw new Error('underlying function failed');
      });
    }).not.to.throw();
    expect(diagLogger.getErrorLogs()).to.deep.equal([
      'underlying function failed',
    ]);
  });

  it('should handle the invoked function throwing a non-Error object', () => {
    expect(() => {
      safeCaller.invoke(() => {
        throw 'some issue';
      });
    }).not.to.throw();
    expect(diagLogger.getErrorLogs()).to.deep.equal(['Unknown error.']);
  });

  it('should preserve the return value of the invoked function', () => {
    let result = '';
    expect(() => {
      result = safeCaller.invokeWithReturn(() => {
        return 'some value';
      }, 'backup value');
    }).not.to.throw();
    expect(result).to.equal('some value');
    expect(diagLogger.getErrorLogs()).to.deep.equal([]);
  });

  it('should use the provied return value when the invoked function fails', () => {
    let result = '';
    expect(() => {
      result = safeCaller.invokeWithReturn(() => {
        throw new Error('underlying function failed');
      }, 'backup value');
    }).not.to.throw();
    expect(result).to.equal('backup value');
    expect(diagLogger.getErrorLogs()).to.deep.equal([
      'underlying function failed',
    ]);
  });
});
