import { expect } from 'chai';
import { TraceAPI } from './api/index.js';
import { trace } from './traceAPI.js';

describe('traceAPI', () => {
  it('should export an instance of TraceAPI', () => {
    expect(trace).to.be.instanceOf(TraceAPI);
  });
});
