import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/types.ts';

export type UserTimingEntryFilter =
  | string[]
  | ((entry: PerformanceMark | PerformanceMeasure) => boolean);

export type UserTimingInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf' | 'limitManager'
> & {
  /**
   * Allowlist filter for mark and measure entries.
   *
   * - `string[]` — only entries whose name appears in the list are captured.
   * - `(entry) => boolean` — return `true` to capture the entry, `false` to ignore it.
   *
   * When omitted all entries are captured.
   */
  allowedEntries?: UserTimingEntryFilter;
};
