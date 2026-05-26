import type { VisibilityStateDocument } from '../common/index.ts';
import { EMB_STATES } from '../constants/index.ts';

// emb.state describes whether the user is actively viewing the page, not
// whether visibilityState is literally 'hidden'. Non-visible states
// (prerender, unloaded, hidden) are not "actively viewing", so they all
// map to Background.
export const getVisibilityState = (visibilityDoc: VisibilityStateDocument) =>
  visibilityDoc.visibilityState === 'visible'
    ? EMB_STATES.Foreground
    : EMB_STATES.Background;
