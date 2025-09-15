import type { SDKFeaturesManager } from '../managers/index.js';
import type { SDKInitConfig } from '../sdk/index.js';
import type { DiagLogger } from '@opentelemetry/api';

type ValidateConfigArgs = {
  featureManager: SDKFeaturesManager;
  diag: DiagLogger;
} & Pick<
  SDKInitConfig,
  'propagator' | 'registerGlobally' | 'defaultInstrumentationConfig'
>;

export const nsfConfigValidation = ({
  diag,
  featureManager,
  registerGlobally,
  propagator,
  defaultInstrumentationConfig,
}: ValidateConfigArgs) => {
  if (!featureManager.isNetworkSpanForwardingEnabled()) {
    return false;
  }

  const warnings = [];

  if (!registerGlobally) {
    warnings.push(
      'Network span forwarding cannot be used when `registerGlobally` is set to false. Turning off network span forwarding.'
    );
  }

  if (propagator) {
    warnings.push(
      'Network span forwarding cannot be used alongside a custom `propagator`. Turning off network span forwarding.'
    );
  }

  if (
    defaultInstrumentationConfig?.omit?.has(
      '@opentelemetry/instrumentation-xml-http-request'
    ) &&
    defaultInstrumentationConfig.omit.has(
      '@opentelemetry/instrumentation-fetch'
    )
  ) {
    warnings.push(
      "Network span forwarding cannot be used when both '@opentelemetry/instrumentation-xml-http-request' and " +
        "'@opentelemetry/instrumentation-fetch' are omitted. Turning off network span forwarding."
    );
  }

  warnings.forEach(warning => {
    diag.warn(warning);
  });

  return warnings.length === 0;
};
