import { expect } from 'chai';
import { session } from './sessionAPI';
import { SessionAPI } from './api/index.js';

describe('sessionAPI', () => {
  it('should export an instance of SessionAPI', () => {
    expect(session).to.be.instanceOf(SessionAPI);
  });
});
