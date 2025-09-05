import type { EmbraceXHRInstrumentationArgs } from './types.js';

import { isWrapped } from '@opentelemetry/instrumentation';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';

export class EmbraceXHRInstrumentation extends XMLHttpRequestInstrumentation {
  private readonly _omitIfAlreadyPatched?: boolean;

  public constructor({
    omitIfAlreadyPatched,
    ...rest
  }: EmbraceXHRInstrumentationArgs = {}) {
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
    // https://github.com/open-telemetry/opentelemetry-js/blob/2d7eecbb19aec17bf2d8b9a4e4b2d84dc92c2d88/experimental/packages/opentelemetry-instrumentation-xml-http-request/src/xhr.ts#L639
    // Exposing an option in this class to allow leaving the existing patch in place and letting a previous instrumentation
    // control the global
    if (
      this._omitIfAlreadyPatched &&
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (isWrapped(XMLHttpRequest.prototype.open) ||
        // eslint-disable-next-line @typescript-eslint/unbound-method
        isWrapped(XMLHttpRequest.prototype.send))
    ) {
      this._diag.debug(
        'XMLHttpRequest is already passed and `omitIfAlreadyPatched` is true, skipping enabling this instrumentation'
      );
      return;
    }

    super.enable();
  }
}
