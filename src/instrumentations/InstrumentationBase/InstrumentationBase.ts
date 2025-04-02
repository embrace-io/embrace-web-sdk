import type {
  Instrumentation,
  InstrumentationConfig,
  InstrumentationModuleDefinition,
} from '@opentelemetry/instrumentation';
import { InstrumentationAbstract } from '../InstrumentationAbstract/index.js';

// copied directly from https://github.com/open-telemetry/opentelemetry-js/blob/90afa2850c0690f7a18ecc511c04927a3183490b/experimental/packages/opentelemetry-instrumentation/src/platform/browser/instrumentation.ts
// to avoid importing internal and experimental code.
export abstract class InstrumentationBase<
    ConfigType extends InstrumentationConfig = InstrumentationConfig,
  >
  extends InstrumentationAbstract<ConfigType>
  implements Instrumentation<ConfigType>
{
  // Commenting this out to prevent this.enable() to be called on super()
  // when this class is extended by custom instrumentation.
  // Keeping this commented to reference the original file, and make it clear we removed the call to this.enable()
  // constructor(
  //   instrumentationName: string,
  //   instrumentationVersion: string,
  //   config: ConfigType
  // ) {
  //   super(instrumentationName, instrumentationVersion, config);
  // if (this._config.enabled) {
  //   this.enable();
  // }

  // no-op
  protected override init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    // NOTE: disabling typescript check,to follow the signature from src/instrumentations/InstrumentationAbstract/InstrumentationAbstract.ts
    // which was copied from OTel repo.
    // TBH, I agree with typescript here, but keeping it disabled for consistency with the base repo
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    | void {
    return undefined;
  }
}
