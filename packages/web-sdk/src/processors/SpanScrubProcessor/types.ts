import type { AttributeScrubber } from '../../common/types.ts';

export interface SpanScrubProcessorArgs {
  attributeScrubbers: AttributeScrubber[];
}
