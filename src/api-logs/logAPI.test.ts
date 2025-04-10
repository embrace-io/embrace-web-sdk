import { expect } from 'chai';
import { LogAPI } from './api/index.js';
import { log } from './logAPI.js';

describe('logAPI', () => {
  it('should export an instance of LogAPI', () => {
    expect(log).to.be.instanceOf(LogAPI);
  });
});
