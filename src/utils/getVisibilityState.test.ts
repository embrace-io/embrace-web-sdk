import * as chai from 'chai';
import type { VisibilityStateDocument } from '../common/index.js';
import { getVisibilityState } from './getVisibilityState.js';

const { expect } = chai;

describe('getVisibilityState', () => {
  it('should report foreground when document is visible', () => {
    expect(
      getVisibilityState({
        visibilityState: 'visible',
      }),
    ).to.equal('foreground');
  });

  it('should report background when document is hidden', () => {
    expect(
      getVisibilityState({
        visibilityState: 'hidden',
      }),
    ).to.equal('background');
  });

  it('should report foreground when document visibility cannot be determined', () => {
    expect(getVisibilityState({} as VisibilityStateDocument)).to.equal(
      'foreground',
    );
  });
});
