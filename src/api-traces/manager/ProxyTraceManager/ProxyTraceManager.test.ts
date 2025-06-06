import type { Context, Span } from '@opentelemetry/api';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { TraceManager } from '../index.js';
import { NoOpTraceManager } from '../NoOpTraceManager/index.js';
import { ProxyTraceManager } from './ProxyTraceManager.js';
import type { ExtendedSpan } from '../../api/index.js';

chai.use(sinonChai);
const { expect } = chai;

describe('ProxyTraceManager', () => {
  let proxyTraceManager: ProxyTraceManager;
  let mockDelegate: TraceManager;

  beforeEach(() => {
    proxyTraceManager = new ProxyTraceManager();
    mockDelegate = {
      startSpan: sinon.stub().returns({} as Span),
      setSpan: sinon.stub().returns({} as Context),
      getSpan: sinon.stub().returns(undefined),
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

  it('should delegate setSpan to the delegate', () => {
    proxyTraceManager.setDelegate(mockDelegate);
    const context = {} as Context;
    const span = {} as ExtendedSpan;
    const resultContext = proxyTraceManager.setSpan(context, span);
    expect(resultContext).to.deep.equal({});
  });

  it('should delegate getSpan to the delegate', () => {
    proxyTraceManager.setDelegate(mockDelegate);
    const context = {} as Context;
    const span = proxyTraceManager.getSpan(context);
    void expect(span).to.be.undefined;
  });
});
