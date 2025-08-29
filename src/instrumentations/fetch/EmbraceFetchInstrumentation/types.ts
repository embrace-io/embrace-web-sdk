import type { FetchInstrumentationConfig } from '@opentelemetry/instrumentation-fetch';

export type EmbraceFetchInstrumentationArgs = FetchInstrumentationConfig & {
  omitIfAlreadyPatched?: boolean;
};
