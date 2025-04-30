import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

// Useful for testing so that we can pass in a document-like object and change its visibilityState
export interface VisibilityStateDocument {
  visibilityState: DocumentVisibilityState;
}

export type SpanSessionVisibilityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
> & {
  backgroundSessions?: boolean;
  visibilityDoc?: VisibilityStateDocument;
};
