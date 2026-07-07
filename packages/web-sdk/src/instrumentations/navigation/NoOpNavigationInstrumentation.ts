import { EmbraceInstrumentationBase } from '../EmbraceInstrumentationBase/index.ts';

/**
 * @deprecated Compatibility shim. Navigation is now captured out of the box via
 * soft navigation; configure templated route names with
 * `initSDK({ routes: [...] })`. This instrumentation does nothing but
 * remains a valid instrumentation so existing
 * `initSDK({ instrumentations: [...] })` wiring keeps working.
 */
export class NoOpNavigationInstrumentation extends EmbraceInstrumentationBase {
  public constructor() {
    super({
      instrumentationName: 'NoOpNavigationInstrumentation',
      instrumentationVersion: '1.0.0',
      config: {},
    });
  }

  public override onEnable(): void {
    // no-op
  }

  public override onDisable(): void {
    // no-op
  }
}
