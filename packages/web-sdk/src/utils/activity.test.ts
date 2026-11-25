import * as chai from 'chai';
import type { VisibilityStateDocument } from '../common/types.ts';
import { isTabEngaged } from './index.ts';

const { expect } = chai;

describe('activity', () => {
  it('returns true when the document is visible', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
    };

    expect(isTabEngaged(visibilityDoc)).to.be.true;
  });

  it('returns false when the document is hidden', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'hidden',
    };

    expect(isTabEngaged(visibilityDoc)).to.be.false;
  });
});
