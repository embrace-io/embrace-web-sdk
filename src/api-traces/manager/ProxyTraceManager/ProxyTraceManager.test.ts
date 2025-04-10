import type { Span } from '@opentelemetry/api';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { NoOpTraceManager } from '../NoOpTraceManager/index.js';
import type { TraceManager } from '../types.js';
import { ProxyTraceManager } from './ProxyTraceManager.js';

chai.use(sinonChai);
const { expect } = chai;

describe('ProxyTraceManager', () => {
  let proxyTraceManager: ProxyTraceManager;
  let mockDelegate: TraceManager;

  beforeEach(() => {
    proxyTraceManager = new ProxyTraceManager();
    mockDelegate = {
      startSpan: sinon.stub().returns({} as Span),
    };
  });

  it('should return NoOpTraceManager as default delegate', () => {
    const delegate = proxyTraceManager.getDelegate();
    expect(delegate).to.be.instanceOf(NoOpTraceManager);
  });

  it('should set and get the delegate', () => {
    proxyTraceManager.setDelegate(mockDelegate);
    const delegate = proxyTraceManager.getDelegate();
    expect(delegate).to.equal(mockDelegate);
  });

  it('should delegate startSpan to the delegate', () => {
    proxyTraceManager.setDelegate(mockDelegate);
    const span = proxyTraceManager.startSpan('span-name');
    expect(span).to.deep.equal({});
  });
});
