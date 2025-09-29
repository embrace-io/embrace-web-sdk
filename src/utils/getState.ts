import { EMB_STATES } from '../constants/index.js';
import type { VisibilityStateDocument } from '../common/index.js';

export const getState = (visibilityDoc: VisibilityStateDocument) =>
  visibilityDoc.visibilityState === 'hidden'
    ? EMB_STATES.Background
    : EMB_STATES.Foreground;
