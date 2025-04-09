import { expect } from 'chai';
import * as sinon from 'sinon';
import { type LogManager, ProxyLogManager } from '../../manager/index.js';
import { LogAPI } from './LogAPI.js';

afterEach(() => {
  sinon.restore();
});
describe('LogAPI', () => {
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
    };
    logAPI.setGlobalLogManager(logManager);
    const result = logAPI.getLogManager();
    expect(result).to.be.instanceOf(ProxyLogManager);
    expect((result as ProxyLogManager).getDelegate()).to.equal(logManager);
  });
});
