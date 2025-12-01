import { expect } from 'chai';
import { log } from './logAPI.js';

describe('logAPI', () => {
  it('should export a log instance with expected methods', () => {
    expect(log).to.have.property('message');
    expect(log).to.have.property('logException');
    expect(log).to.have.property('setGlobalLogManager');
  });
});
