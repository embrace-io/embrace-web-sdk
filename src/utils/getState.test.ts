import * as chai from 'chai';
import { getState } from './getState.js';
import type { VisibilityStateDocument } from '../common/index.js';

const { expect } = chai;

describe('getState', () => {
  it('should report foreground when document is visible', () => {
    expect(
      getState({
        visibilityState: 'visible',
      })
    ).to.equal('foreground');
  });

  it('should report background when document is hidden', () => {
    expect(
      getState({
        visibilityState: 'hidden',
      })
    ).to.equal('background');
  });

  it('should report foreground when document visibility cannot be determined', () => {
    expect(getState({} as VisibilityStateDocument)).to.equal('foreground');
  });
});
