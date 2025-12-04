import { expect } from 'chai';
import { LogAPI } from './api/index.ts';
import { log } from './logAPI.ts';

describe('logAPI', () => {
  it('should export an instance of LogAPI', () => {
    expect(log).to.be.instanceOf(LogAPI);
  });
});
