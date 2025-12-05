import { expect } from 'chai';
import { TraceAPI } from './api/index.ts';
import { trace } from './traceAPI.ts';

describe('traceAPI', () => {
  it('should export an instance of TraceAPI', () => {
    expect(trace).to.be.instanceOf(TraceAPI);
  });
});
