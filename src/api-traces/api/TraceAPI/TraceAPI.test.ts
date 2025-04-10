import { expect } from 'chai';
import * as sinon from 'sinon';
import { ProxyTraceManager, type TraceManager } from '../../manager/index.js';
import { TraceAPI } from './TraceAPI.js';
import type { Span } from '@opentelemetry/api';

afterEach(() => {
  sinon.restore();
});
describe('TraceAPI', () => {
  it('should return the same instance', () => {
    const instance1 = TraceAPI.getInstance();
    const instance2 = TraceAPI.getInstance();
    expect(instance1).to.equal(instance2);
  });
  it('should return the global trace manager', () => {
    const traceAPI = TraceAPI.getInstance();
    const traceManager: TraceManager = {
      // Mock implementation of TraceManager
      startPerformanceSpan: sinon.stub().returns({} as Span),
    };
    traceAPI.setGlobalTraceManager(traceManager);
    const result = traceAPI.getTraceManager();
    expect(result).to.be.instanceOf(ProxyTraceManager);
    expect((result as ProxyTraceManager).getDelegate()).to.equal(traceManager);
  });
});
