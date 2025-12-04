import { expect } from 'chai';
import { SessionAPI } from './api/index.ts';
import { session } from './sessionAPI.ts';

describe('sessionAPI', () => {
  it('should export an instance of SessionAPI', () => {
    expect(session).to.be.instanceOf(SessionAPI);
  });
});
