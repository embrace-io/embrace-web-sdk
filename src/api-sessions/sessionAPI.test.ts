import { expect } from 'chai';
import { session } from './sessionAPI.js';

describe('sessionAPI', () => {
  it('should export a session instance with expected methods', () => {
    expect(session).to.have.property('getSessionId');
    expect(session).to.have.property('setGlobalSessionManager');
    expect(session).to.have.property('addBreadcrumb');
  });
});
