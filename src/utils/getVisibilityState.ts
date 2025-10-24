import type { VisibilityStateDocument } from '../common/index.js';
import { EMB_STATES } from '../constants/index.js';

export const getVisibilityState = (visibilityDoc: VisibilityStateDocument) =>
  visibilityDoc.visibilityState === 'hidden'
    ? EMB_STATES.Background
    : EMB_STATES.Foreground;
