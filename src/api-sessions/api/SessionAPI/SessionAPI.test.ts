import { expect } from 'chai';
import * as sinon from 'sinon';
import { SessionAPI } from './SessionAPI';

afterEach(() => {
  sinon.restore();
});
describe('SessionAPI', () => {
  it('should return the same instance', () => {
    const instance1 = SessionAPI.getInstance();
    const instance2 = SessionAPI.getInstance();
    expect(instance1).to.equal(instance2);
  });
  it('should set the global session manager', () => {
    const sessionManager = {} as any;
    const sessionAPI = SessionAPI.getInstance();
    const setDelegateStub = sinon.stub(
      sessionAPI.getSpanSessionManager(),
      'setDelegate'
    );
    sessionAPI.setGlobalSessionManager(sessionManager);
    expect(setDelegateStub.calledOnce).to.be.true;
    expect(setDelegateStub.firstCall.args[0]).to.equal(sessionManager);
  });
  it('should return the global session manager', () => {
    const sessionAPI = SessionAPI.getInstance();
    const sessionManager = {} as any;
    sessionAPI.setGlobalSessionManager(sessionManager);
    const result = sessionAPI.getSpanSessionManager().getDelegate();
    expect(result).to.equal(sessionManager);
  });
});
