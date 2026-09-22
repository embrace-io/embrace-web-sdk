import type { VisibilityStateDocument } from '../common/index.ts';

export const isTabEngaged = (visibilityDoc: VisibilityStateDocument): boolean =>
  visibilityDoc.visibilityState === 'visible' && visibilityDoc.hasFocus();
