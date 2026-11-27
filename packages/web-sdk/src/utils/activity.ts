import type { VisibilityStateDocument } from '../common/index.ts';

// Focus isn't required, so tabs side by side or behind a focused window each
// hold a session part.
export const isTabEngaged = (visibilityDoc: VisibilityStateDocument): boolean =>
  visibilityDoc.visibilityState === 'visible';
