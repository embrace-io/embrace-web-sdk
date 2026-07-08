import type { DiagLogger } from '@opentelemetry/api';
import type { NavigationHost, TitleDocument } from '../../common/index.ts';
import type { UserSessionManagerInternal } from '../EmbraceUserSessionManager/index.ts';

export interface EmbracePageManagerArgs {
  diag?: DiagLogger;
  useDocumentTitleAsPageLabel?: boolean;
  titleDocument?: TitleDocument;
  /**
   * Window-shaped object used to detect and listen for soft navigations via
   * the Navigation API. Defaults to `window`. Optional `navigation` property
   * handles old browsers that lack the API.
   */
  navigationHost?: NavigationHost;
  /**
   * Used to roll the session part over on soft navigation. Optional so
   * EmbracePageManager stays usable standalone (without session-part
   * awareness) — when omitted, soft navigation still updates the route but
   * skips the rollover.
   */
  userSessionManager?: UserSessionManagerInternal;
}
