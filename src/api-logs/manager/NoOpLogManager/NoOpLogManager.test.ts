import { expect } from 'chai';
import { NoOpLogManager } from './NoOpLogManager.js';

describe('NoOpLogManager', () => {
  let noOpLogManager: NoOpLogManager;

  beforeEach(() => {
    noOpLogManager = new NoOpLogManager();
  });

  it('should return null for message', () => {
    expect(() => {
      noOpLogManager.message('logging an error log', 'error', {
        key1: 'value1',
      });
    }).to.not.throw();
  });
});
