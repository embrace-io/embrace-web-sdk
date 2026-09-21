import * as chai from 'chai';
import type { VisibilityStateDocument } from '../common/types.ts';
import { isTabEngaged } from './index.ts';

const { expect } = chai;

describe('activity', () => {
  it('returns true when the document is has focus', () => {
    const visibilityDoc: VisibilityStateDocument = {
      hasFocus: () => true,
      visibilityState: 'visible',
    };

    expect(isTabEngaged(visibilityDoc)).to.be.true;
  });

  it('returns false when the document does not have focus', () => {
    const visibilityDoc: VisibilityStateDocument = {
      hasFocus: () => false,
      visibilityState: 'visible',
    };

    expect(isTabEngaged(visibilityDoc)).to.be.false;
  });

  it('returns false when the document is hidden', () => {
    const visibilityDoc: VisibilityStateDocument = {
      hasFocus: () => true,
      visibilityState: 'hidden',
    };

    expect(isTabEngaged(visibilityDoc)).to.be.false;
  });
});
