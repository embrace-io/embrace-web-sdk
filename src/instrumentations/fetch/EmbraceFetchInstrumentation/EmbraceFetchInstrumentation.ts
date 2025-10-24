import { isWrapped } from '@opentelemetry/instrumentation';

import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import type { EmbraceFetchInstrumentationArgs } from './types.js';

export class EmbraceFetchInstrumentation extends FetchInstrumentation {
  private readonly _omitIfAlreadyPatched?: boolean;

  public constructor({
    omitIfAlreadyPatched,
    ...rest
  }: EmbraceFetchInstrumentationArgs = {}) {
    // Base constructor automatically calls this.enable() if enabled is true, but we need to run our overridden constructor
    // first so force enabled false here and call it ourselves later
    super({ ...rest, enabled: false });

    this._omitIfAlreadyPatched = omitIfAlreadyPatched;

    if (rest.enabled) {
      this.enable();
    }
  }

  public override enable(): void {
    // The base implementation always removes and then re-patches, this means the last instrumentation to run "wins":
    // https://github.com/open-telemetry/opentelemetry-js/blob/2d7eecbb19aec17bf2d8b9a4e4b2d84dc92c2d88/experimental/packages/opentelemetry-instrumentation-fetch/src/fetch.ts#L604
    // Exposing an option in this class to allow leaving the existing patch in place and letting a previous instrumentation
    // control the global
    if (this._omitIfAlreadyPatched && isWrapped(fetch)) {
      this._diag.debug(
        'fetch is already passed and `omitIfAlreadyPatched` is true, skipping enabling this instrumentation',
      );
      return;
    }

    super.enable();
  }
}
