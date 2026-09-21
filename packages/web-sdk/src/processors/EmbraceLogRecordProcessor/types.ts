import type {
  URLDocument,
  VisibilityStateDocument,
} from '../../common/index.ts';

export type EmbraceLogRecordProcessorArgs = {
  urlDocument?: URLDocument;
  visibilityDocument?: VisibilityStateDocument;
};
