import * as chai from 'chai';
import type { VisibilityStateDocument } from '../common/types.ts';
import { getVisibilityState } from './getVisibilityState.ts';

const { expect } = chai;

describe('getVisibilityState', () => {
  it('should report foreground when document is visible', () => {
    expect(
      getVisibilityState({
        visibilityState: 'visible',
        hasFocus: () => true,
      }),
    ).to.equal('foreground');
  });

  it('should report background when document is hidden', () => {
    expect(
      getVisibilityState({
        visibilityState: 'hidden',
        hasFocus: () => false,
      }),
    ).to.equal('background');
  });

  it('should report background when document visibility cannot be determined', () => {
    expect(getVisibilityState({} as VisibilityStateDocument)).to.equal(
      'background',
    );
  });
});
