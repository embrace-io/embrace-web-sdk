import * as chai from 'chai';
import * as sinon from 'sinon';
import { type LogManager, ProxyLogManager } from '../../manager/index.js';
import { LogAPI } from './LogAPI.js';
import sinonChai from 'sinon-chai';

chai.use(sinonChai);
const { expect } = chai;

afterEach(() => {
  sinon.restore();
});
describe('LogAPI', () => {
  let logAPI: LogAPI;

  beforeEach(() => {
    logAPI = LogAPI.getInstance();
  });

  it('should return the same instance', () => {
    const instance1 = LogAPI.getInstance();
    const instance2 = LogAPI.getInstance();
    expect(instance1).to.equal(instance2);
  });

  it('should return the global log manager', () => {
    const logAPI = LogAPI.getInstance();
    const logManager: LogManager = {
      // Mock implementation of LogManager
      message: sinon.stub(),
      logException: sinon.stub(),
    };
    logAPI.setGlobalLogManager(logManager);
    const result = logAPI.getLogManager();
    expect(result).to.be.instanceOf(ProxyLogManager);
    expect((result as ProxyLogManager).getDelegate()).to.equal(logManager);
  });

  it('should forward calls to the log manager', () => {
    const mockLogManager: LogManager = {
      // Mock implementation of LogManager
      message: sinon.stub(),
      logException: sinon.stub(),
    };
    logAPI.setGlobalLogManager(mockLogManager);

    logAPI.message('This is an info log', 'info', { key: 'value' });
    expect(mockLogManager.message).to.have.been.calledOnceWith(
      'This is an info log',
      'info',
      { key: 'value' }
    );

    const ts = Date.now();
    const err = new Error();
    logAPI.logException(ts, err, true, { key: 'value' });
    expect(mockLogManager.logException).to.have.been.calledOnceWith(
      ts,
      err,
      true,
      { key: 'value' }
    );
  });
});
