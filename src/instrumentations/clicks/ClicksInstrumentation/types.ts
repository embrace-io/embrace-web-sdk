import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export type ClicksInstrumentationArgs = {
  shouldTrack?: (element: HTMLElement) => boolean;
  innerTextForElement?: (element: HTMLElement) => string;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
