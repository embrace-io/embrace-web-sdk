import { expect } from 'chai';
import { SessionAPI } from './api/index.js';
import { session } from './sessionAPI.js';

describe('sessionAPI', () => {
  it('should export an instance of SessionAPI', () => {
    expect(session).to.be.instanceOf(SessionAPI);
  });
});
