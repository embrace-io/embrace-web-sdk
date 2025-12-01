import { expect } from 'chai';
import { trace } from './traceAPI.js';

describe('traceAPI', () => {
  it('should export a trace instance with expected methods', () => {
    expect(trace).to.have.property('startSpan');
    expect(trace).to.have.property('setSpan');
    expect(trace).to.have.property('setGlobalTraceManager');
  });
});
