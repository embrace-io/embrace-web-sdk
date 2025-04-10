import type {
  DiagLogger,
  Meter,
  MeterProvider,
  Span,
  Tracer,
  TracerProvider,
} from '@opentelemetry/api';
import { diag, metrics, trace } from '@opentelemetry/api';
import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type {
  Instrumentation,
  InstrumentationConfig,
  InstrumentationModuleDefinition,
  SpanCustomizationHook,
} from '@opentelemetry/instrumentation';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';

// copied directly from https://github.com/open-telemetry/opentelemetry-js/blob/90afa2850c0690f7a18ecc511c04927a3183490b/experimental/packages/opentelemetry-instrumentation/src/instrumentation.ts
// to avoid importing internal and experimental code. Some unused blocks removed.
/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export abstract class InstrumentationAbstract<
  ConfigType extends InstrumentationConfig = InstrumentationConfig,
> implements Instrumentation<ConfigType>
{
  protected _config: ConfigType = {} as ConfigType;
  protected _diag: DiagLogger;

  public constructor(
    public readonly instrumentationName: string,
    public readonly instrumentationVersion: string,
    config: ConfigType
  ) {
    this.setConfig(config);

    this._diag = diag.createComponentLogger({
      namespace: instrumentationName,
    });

    this._tracer = trace.getTracer(instrumentationName, instrumentationVersion);
    this._meter = metrics.getMeter(instrumentationName, instrumentationVersion);
    this._logger = logs.getLogger(instrumentationName, instrumentationVersion);
    this._updateMetricInstruments();
  }

  private _tracer: Tracer;

  /* Returns tracer */
  protected get tracer(): Tracer {
    return this._tracer;
  }

  private _meter: Meter;

  /* Returns meter */
  protected get meter(): Meter {
    return this._meter;
  }

  private _logger: Logger;

  /* Returns logger */
  protected get logger(): Logger {
    return this._logger;
  }

  /**
   * @experimental
   *
   * Get module definitions defined by {@link init}.
   * This can be used for experimental compile-time instrumentation.
   *
   * @returns an array of {@link InstrumentationModuleDefinition}
   */
  public getModuleDefinitions(): InstrumentationModuleDefinition[] {
    // NOTE: disabling typescript check, as this class was copied from OTel repo.
    // TBH, I agree with typescript here, but keeping it disabled for consistency with the base repo
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const initResult = this.init() ?? [];
    if (!Array.isArray(initResult)) {
      return [initResult];
    }

    return initResult;
  }

  /* Disable plugin */
  public abstract disable(): void;

  /* Enable plugin */
  public abstract enable(): void;

  /* Returns InstrumentationConfig */
  public getConfig(): ConfigType {
    return this._config;
  }

  /**
   * Sets InstrumentationConfig to this plugin
   * @param config
   */
  public setConfig(config: ConfigType): void {
    // copy config first level properties to ensure they are immutable.
    // nested properties are not copied, thus are mutable from the outside.
    this._config = {
      enabled: true,
      ...config,
    };
  }

  /**
   * Sets LoggerProvider to this plugin
   * @param loggerProvider
   */
  public setLoggerProvider(loggerProvider: LoggerProvider): void {
    this._logger = loggerProvider.getLogger(
      this.instrumentationName,
      this.instrumentationVersion
    );
  }

  /**
   * Sets MeterProvider to this plugin
   * @param meterProvider
   */
  public setMeterProvider(meterProvider: MeterProvider): void {
    this._meter = meterProvider.getMeter(
      this.instrumentationName,
      this.instrumentationVersion
    );

    this._updateMetricInstruments();
  }

  /**
   * Sets TraceProvider to this plugin
   * @param tracerProvider
   */
  public setTracerProvider(tracerProvider: TracerProvider): void {
    this._tracer = tracerProvider.getTracer(
      this.instrumentationName,
      this.instrumentationVersion
    );
  }

  /**
   * Init method in which plugin should define _modules and patches for
   * methods.
   */
  protected abstract init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    // NOTE: disabling typescript check, as this class was copied from OTel repo.
    // I agree with typescript here, but keeping it disabled for consistency with the base repo
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    | void;

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  protected _updateMetricInstruments(): void {
    return;
  }

  /**
   * Execute span customization hook, if configured, and log any errors.
   * Any semantics of the trigger and info are defined by the specific instrumentation.
   * @param hookHandler The optional hook handler which the user has configured via instrumentation config
   * @param triggerName The name of the trigger for executing the hook for logging purposes
   * @param span The span to which the hook should be applied
   * @param info The info object to be passed to the hook, with useful data the hook may use
   */
  protected _runSpanCustomizationHook<SpanCustomizationInfoType>(
    hookHandler: SpanCustomizationHook<SpanCustomizationInfoType> | undefined,
    triggerName: string,
    span: Span,
    info: SpanCustomizationInfoType
  ) {
    if (!hookHandler) {
      return;
    }

    try {
      hookHandler(span, info);
    } catch (e) {
      this._diag.error(
        `Error running span customization hook due to exception in handler`,
        { triggerName },
        e
      );
    }
  }
}
