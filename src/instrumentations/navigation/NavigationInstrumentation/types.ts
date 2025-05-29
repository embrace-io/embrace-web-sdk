import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export interface NavigationEvent {
  pathname: string;
  search: string;
}

export type NavigationAction = 'PUSH' | 'POP' | 'REPLACE';

export type NavigationInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
>;
