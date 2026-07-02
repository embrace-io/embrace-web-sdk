import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/types.ts';

export type ClicksInstrumentationArgs = {
  shouldTrack?: (element: HTMLElement) => boolean;
  innerTextForElement?: (element: HTMLElement) => string;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
