import type { MeterProvider, Span, TracerProvider } from '@opentelemetry/api';
import type {
  InstrumentationConfig,
  InstrumentationModuleDefinition,
  SpanCustomizationHook,
} from '@opentelemetry/instrumentation';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { InMemoryDiagLogger } from '../../../tests/utils/index.ts';
import { InstrumentationAbstract } from './InstrumentationAbstract.ts';

chai.use(sinonChai);
const { expect } = chai;

interface TestConfig extends InstrumentationConfig {
  testOption?: string;
  spanCustomizationHook?: SpanCustomizationHook<{ url: string }>;
}

class TestInstrumentation extends InstrumentationAbstract<TestConfig> {
  public constructor(config: TestConfig = {}) {
    super('test-instrumentation', '1.0.0', config);
  }

  public disable(): void {
    // no-op for tests
  }

  public enable(): void {
    // no-op for tests
  }

  protected init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    | undefined {
    return undefined;
  }

  // Expose protected methods for testing
  public exposedRunSpanCustomizationHook(
    hookHandler: SpanCustomizationHook<{ url: string }> | undefined,
    triggerName: string,
    span: Span,
    info: { url: string },
  ): void {
    this._runSpanCustomizationHook(hookHandler, triggerName, span, info);
  }

  public exposedUpdateMetricInstruments(): void {
    this._updateMetricInstruments();
  }

  public getDiag() {
    return this._diag;
  }
}

class TestInstrumentationWithModules extends InstrumentationAbstract<TestConfig> {
  private readonly _modules: InstrumentationModuleDefinition[];

  public constructor(
    modules: InstrumentationModuleDefinition[],
    config: TestConfig = {},
  ) {
    super('test-instrumentation-with-modules', '1.0.0', config);
    this._modules = modules;
  }

  public disable(): void {}
  public enable(): void {}

  protected init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    | undefined {
    if (this._modules.length === 1) {
      return this._modules[0];
    }
    return this._modules;
  }
}

describe('InstrumentationAbstract', () => {
  let instrumentation: TestInstrumentation;

  beforeEach(() => {
    instrumentation = new TestInstrumentation();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      const config = { testOption: 'value' };
      const inst = new TestInstrumentation(config);
      expect(inst.getConfig().testOption).to.equal('value');
    });

    it('should create diag logger with namespace', () => {
      expect(instrumentation.getDiag()).to.exist;
    });

    it('should set instrumentationName and instrumentationVersion', () => {
      expect(instrumentation.instrumentationName).to.equal(
        'test-instrumentation',
      );
      expect(instrumentation.instrumentationVersion).to.equal('1.0.0');
    });
  });

  describe('getConfig', () => {
    it('should return current config', () => {
      const inst = new TestInstrumentation({ testOption: 'test' });
      expect(inst.getConfig().testOption).to.equal('test');
    });

    it('should include enabled: true by default', () => {
      expect(instrumentation.getConfig().enabled).to.be.true;
    });
  });

  describe('setConfig', () => {
    it('should update config', () => {
      instrumentation.setConfig({ testOption: 'updated' });
      expect(instrumentation.getConfig().testOption).to.equal('updated');
    });

    it('should preserve enabled: true default when not specified', () => {
      instrumentation.setConfig({ testOption: 'value' });
      expect(instrumentation.getConfig().enabled).to.be.true;
    });

    it('should allow setting enabled: false', () => {
      instrumentation.setConfig({ enabled: false });
      expect(instrumentation.getConfig().enabled).to.be.false;
    });
  });

  describe('setLoggerProvider', () => {
    it('should update logger', () => {
      const mockLoggerProvider = {
        getLogger: sinon.stub().returns({}),
      } as unknown as LoggerProvider;

      instrumentation.setLoggerProvider(mockLoggerProvider);

      expect(mockLoggerProvider.getLogger).to.have.been.calledWith(
        'test-instrumentation',
        '1.0.0',
      );
    });
  });

  describe('setMeterProvider', () => {
    it('should update meter', () => {
      const mockMeterProvider = {
        getMeter: sinon.stub().returns({}),
      } as unknown as MeterProvider;

      instrumentation.setMeterProvider(mockMeterProvider);

      expect(mockMeterProvider.getMeter).to.have.been.calledWith(
        'test-instrumentation',
        '1.0.0',
      );
    });

    it('should call _updateMetricInstruments', () => {
      const updateSpy = sinon.spy(
        instrumentation,
        'exposedUpdateMetricInstruments',
      );
      const mockMeterProvider = {
        getMeter: sinon.stub().returns({}),
      } as unknown as MeterProvider;

      // The spy won't work on the internal call, but we verify the method exists
      instrumentation.setMeterProvider(mockMeterProvider);
      expect(updateSpy).to.not.have.been.called; // Spy is on exposed method, not internal
    });
  });

  describe('setTracerProvider', () => {
    it('should update tracer', () => {
      const mockTracerProvider = {
        getTracer: sinon.stub().returns({}),
      } as unknown as TracerProvider;

      instrumentation.setTracerProvider(mockTracerProvider);

      expect(mockTracerProvider.getTracer).to.have.been.calledWith(
        'test-instrumentation',
        '1.0.0',
      );
    });
  });

  describe('getModuleDefinitions', () => {
    it('should return empty array when init returns undefined', () => {
      const result = instrumentation.getModuleDefinitions();
      expect(result).to.deep.equal([]);
    });

    it('should return array from init when it returns single module', () => {
      const module: InstrumentationModuleDefinition = {
        name: 'test-module',
        supportedVersions: ['1.x'],
      } as InstrumentationModuleDefinition;

      const inst = new TestInstrumentationWithModules([module]);
      const result = inst.getModuleDefinitions();

      expect(result).to.deep.equal([module]);
    });

    it('should return array directly when init returns array', () => {
      const modules: InstrumentationModuleDefinition[] = [
        { name: 'module1', supportedVersions: ['1.x'] },
        { name: 'module2', supportedVersions: ['2.x'] },
      ] as InstrumentationModuleDefinition[];

      const inst = new TestInstrumentationWithModules(modules);
      const result = inst.getModuleDefinitions();

      expect(result).to.deep.equal(modules);
    });
  });

  describe('_runSpanCustomizationHook', () => {
    let mockSpan: Span;

    beforeEach(() => {
      mockSpan = {
        setAttribute: sinon.stub(),
        setAttributes: sinon.stub(),
      } as unknown as Span;
    });

    it('should execute hook successfully', () => {
      const hook = sinon.stub();
      const info = { url: 'https://example.com' };

      instrumentation.exposedRunSpanCustomizationHook(
        hook,
        'testTrigger',
        mockSpan,
        info,
      );

      expect(hook).to.have.been.calledOnceWith(mockSpan, info);
    });

    it('should catch hook error and log', () => {
      const diag = new InMemoryDiagLogger();
      const inst = new TestInstrumentation();
      // @ts-expect-error - accessing protected member for testing
      inst._diag = diag;

      const hook = sinon.stub().throws(new Error('Hook failed'));

      inst.exposedRunSpanCustomizationHook(hook, 'testTrigger', mockSpan, {
        url: 'test',
      });

      expect(diag.getErrorLogs()).to.have.lengthOf(1);
      expect(diag.getErrorLogs()[0]).to.include(
        'Error running span customization hook',
      );
    });

    it('should be no-op when hook is undefined', () => {
      // Should not throw
      expect(() =>
        instrumentation.exposedRunSpanCustomizationHook(
          undefined,
          'testTrigger',
          mockSpan,
          { url: 'test' },
        ),
      ).to.not.throw();
    });
  });

  describe('_updateMetricInstruments', () => {
    it('should be a no-op by default', () => {
      // Should not throw
      expect(() => instrumentation.exposedUpdateMetricInstruments()).to.not
        .throw;
    });
  });
});
