import * as sinon from 'sinon';

export const setupTestWebVitalListeners = () => {
  const clsStub = sinon.stub();
  const fcpStub = sinon.stub();
  const lcpStub = sinon.stub();
  const inpStub = sinon.stub();
  const ttfbStub = sinon.stub();
  return {
    clsStub,
    fcpStub,
    lcpStub,
    inpStub,
    ttfbStub,
    listeners: {
      CLS: clsStub,
      FCP: fcpStub,
      LCP: lcpStub,
      INP: inpStub,
      TTFB: ttfbStub,
      FID: undefined,
    },
  };
};
