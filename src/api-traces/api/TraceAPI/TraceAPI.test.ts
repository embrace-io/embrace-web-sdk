import * as sinon from 'sinon';
import { ProxyTraceManager, type TraceManager } from '../../manager/index.js';
import type { Context, Span } from '@opentelemetry/api';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { TraceAPI } from './TraceAPI.js';
import type { ExtendedSpan } from './types.js';

chai.use(sinonChai);
const { expect } = chai;

afterEach(() => {
  sinon.restore();
});

describe('TraceAPI', () => {
  let traceAPI: TraceAPI;

  beforeEach(() => {
    traceAPI = TraceAPI.getInstance();
  });

  it('should return the same instance', () => {
    const instance1 = TraceAPI.getInstance();
    const instance2 = TraceAPI.getInstance();
    expect(instance1).to.equal(instance2);
  });

  it('should return the global trace manager', () => {
    const traceAPI = TraceAPI.getInstance();
    const traceManager: TraceManager = {
      // Mock implementation of TraceManager
      startSpan: sinon.stub().returns({} as Span),
      setSpan: sinon.stub(),
      getSpan: sinon.stub(),
    };
    traceAPI.setGlobalTraceManager(traceManager);
    const result = traceAPI.getTraceManager();
    expect(result).to.be.instanceOf(ProxyTraceManager);
    expect((result as ProxyTraceManager).getDelegate()).to.equal(traceManager);
  });

  it('should forward calls to the trace manager', () => {
    const mockTraceManager: TraceManager = {
      // Mock implementation of TraceManager
      startSpan: sinon.stub().returns({} as Span),
      setSpan: sinon.stub(),
      getSpan: sinon.stub(),
    };
    traceAPI.setGlobalTraceManager(mockTraceManager);

    traceAPI.startSpan('span-name');
    void expect(mockTraceManager.startSpan).to.have.been.calledOnceWith(
      'span-name'
    );

    const mockContext = {} as Context;

    const mockSpan = {} as ExtendedSpan;
    traceAPI.setSpan(mockContext, mockSpan);
    void expect(mockTraceManager.setSpan).to.have.been.calledOnceWith(
      mockContext,
      mockSpan
    );

    traceAPI.getSpan(mockContext);
    void expect(mockTraceManager.getSpan).to.have.been.calledOnceWith(
      mockContext
    );
  });
});
