import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { GLOBAL_SDK_NAME } from './constants.js';
import { bootSDK, onReady } from './bootSDK.js';
import type { EmbraceSdk, GlobalSdkAPI } from './types.js';

chai.use(sinonChai);
const { expect } = chai;

// We need to redefine the global for the test as well
declare global {
  interface Window {
    [GLOBAL_SDK_NAME]?: GlobalSdkAPI;
  }
}

const mockSdk = {
  onReady,
  log: {},
  session: {},
  trace: {},
  user: {},
  sdk: {
    initSDK: () => {},
  },
} as unknown as EmbraceSdk;

describe('bootSDK', () => {
  before(() => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete window[GLOBAL_SDK_NAME];
  });

  it('should define the global SDK object', () => {
    bootSDK(mockSdk);

    void expect(window[GLOBAL_SDK_NAME]).to.exist;
    expect(window[GLOBAL_SDK_NAME]?.log).to.equal(mockSdk.log);
    expect(window[GLOBAL_SDK_NAME]?.session).to.equal(mockSdk.session);
    expect(window[GLOBAL_SDK_NAME]?.trace).to.equal(mockSdk.trace);
    expect(window[GLOBAL_SDK_NAME]?.user).to.equal(mockSdk.user);
  });

  it('should execute queued callbacks', () => {
    const mockCallback = sinon.stub();
    // No need to add the other properties, we are only testing for the queue
    window[GLOBAL_SDK_NAME] = { q: [mockCallback] } as unknown as GlobalSdkAPI;

    bootSDK(mockSdk);

    void expect(mockCallback).to.have.been.calledOnce;
    void expect(window[GLOBAL_SDK_NAME].q).to.be.empty;
  });

  it('should handle errors in callbacks', () => {
    const mockCallback = sinon.stub().throws(new Error('Test error'));
    window[GLOBAL_SDK_NAME] = { q: [mockCallback] } as unknown as GlobalSdkAPI;

    expect(() => {
      bootSDK(mockSdk);
    }).not.to.throw();
  });
});

describe('onReady', () => {
  it('should execute the callback', () => {
    const mockCallback = sinon.stub();

    bootSDK(mockSdk);
    window[GLOBAL_SDK_NAME]?.onReady(mockCallback);

    void expect(mockCallback).to.have.been.calledOnce;
  });

  it('should not throw an error if the SDK is not defined', () => {
    const mockCallback = sinon.stub();

    onReady(mockCallback);

    void expect(mockCallback).to.have.been.calledOnce;
  });
});
