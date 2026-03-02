import type { DiagLogger } from '@opentelemetry/api';
import type { TitleDocument } from '../../common/index.ts';
import type { EMB_NAVIGATION_INSTRUMENTATIONS } from '../../constants/index.ts';

export interface EmbracePageManagerArgs {
  diag?: DiagLogger;
  shouldCleanupPathOptionsFromRouteName?: boolean;
  useDocumentTitleAsPageLabel?: boolean;
  titleDocument?: TitleDocument;
}

export interface SetCurrentRouteSpanOptions {
  instrumentationType: EMB_NAVIGATION_INSTRUMENTATIONS;
}

export interface SetCurrentRouteOptions {
  instrumentationType?: EMB_NAVIGATION_INSTRUMENTATIONS;
}
