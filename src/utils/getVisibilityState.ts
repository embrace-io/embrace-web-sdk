import type { VisibilityStateDocument } from '../common/index.ts';
import { EMB_STATES } from '../constants/index.ts';

export const getVisibilityState = (visibilityDoc: VisibilityStateDocument) =>
  visibilityDoc.visibilityState === 'hidden'
    ? EMB_STATES.Background
    : EMB_STATES.Foreground;
