import type { VisibilityStateDocument } from '../common/types.ts';
import { EMB_STATES } from '../constants/attributes.ts';

// emb.state describes whether the user is actively viewing the page.
// Anything other than 'visible' (including the fallback when
// visibilityState is missing) maps to Background.
export const getVisibilityState = (visibilityDoc: VisibilityStateDocument) =>
  visibilityDoc.visibilityState === 'visible'
    ? EMB_STATES.Foreground
    : EMB_STATES.Background;
