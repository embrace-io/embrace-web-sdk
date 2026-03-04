import type { PageManager } from '../../../api-page/index.ts';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

// TypeScript's DOM lib does not yet include Long Animation Frames API types (as of TS 5.9).
// Replace these with the built-in types once they are available.
export interface PerformanceScriptTimingEntry {
  readonly name: 'script';
  readonly entryType: 'script';
  readonly startTime: number;
  readonly duration: number;
  readonly invoker: string;
  readonly invokerType:
    | 'classic-script'
    | 'module-script'
    | 'event-listener'
    | 'user-callback'
    | 'resolve-promise'
    | 'reject-promise';
  readonly sourceURL: string;
  readonly sourceFunctionName: string;
  readonly sourceCharPosition: number;
  readonly pauseDuration: number;
  readonly forcedStyleAndLayoutDuration: number;
  readonly windowAttribution:
    | 'self'
    | 'descendant'
    | 'ancestor'
    | 'same-page'
    | 'other';
  readonly executionStart: number;
}

export interface PerformanceLongAnimationFrameTimingEntry {
  readonly name: 'long-animation-frame';
  readonly entryType: 'long-animation-frame';
  readonly startTime: number;
  readonly duration: number;
  readonly renderStart: number;
  readonly styleAndLayoutStart: number;
  readonly blockingDuration: number;
  readonly firstUIEventTimestamp: number;
  readonly scripts: readonly PerformanceScriptTimingEntry[];
}

export type LoafInstrumentationArgs = {
  pageManager?: PageManager;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
