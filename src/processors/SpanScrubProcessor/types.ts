import type { AttributeScrubber } from '../../common/index.ts';

export interface SpanScrubProcessorArgs {
  attributeScrubbers: AttributeScrubber[];
}
