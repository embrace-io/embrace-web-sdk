/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Ported to Mocha, Chai and sinon from open-telemetry/opentelemetry-browser#548 (unmerged) at https://github.com/open-telemetry/opentelemetry-browser/blob/9191eb4db3f9b79414c1c10c611dd80984bc53e3/packages/instrumentation/src/InstrumentationBase/InstrumentationBase.test.ts

import type { TextMapPropagator } from '@opentelemetry/api';
import { diag, propagation, trace } from '@opentelemetry/api';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { setupTestDiagLogger } from '../../../tests/utils/index.ts';
import { InstrumentationBase } from './InstrumentationBase.ts';

chai.use(sinonChai);
const { expect } = chai;

class Probe extends InstrumentationBase {
  public initCount = 0;
  public onEnableCount = 0;
  public onDisableCount = 0;
  public isEnabledInOnEnable: boolean | undefined;
  // `undefined` means the hook succeeds.
  public initError: unknown;
  public onEnableError: unknown;
  public onDisableError: unknown;

  constructor() {
    super('test', '1.0.0', {});
  }

  public emitSpan(name: string): void {
    this.tracer.startSpan(name).end();
  }

  public emitLog(body: string): void {
    this.logger.emit({ body });
  }

  public exposedPropagator(): TextMapPropagator {
    return this.propagator;
  }

  protected override _init(): void {
    this.initCount += 1;
    if (this.initError !== undefined) {
      throw this.initError;
    }
  }

  protected override _onEnable(): void {
    this.onEnableCount += 1;
    this.isEnabledInOnEnable = this.isEnabled();
    if (this.onEnableError !== undefined) {
      throw this.onEnableError;
    }
  }

  protected override _onDisable(): void {
    this.onDisableCount += 1;
    if (this.onDisableError !== undefined) {
      throw this.onDisableError;
    }
  }
}

class WrapProbe extends InstrumentationBase {
  public wrap<Nodule extends object, FieldName extends keyof Nodule>(
    nodule: Nodule,
    name: FieldName,
    wrapper: (original: Nodule[FieldName]) => Nodule[FieldName],
  ): void {
    this._wrap(nodule, name, wrapper);
  }

  public exposedSafeExecute<T>(
    errorMessage: string,
    fn: () => T,
  ): T | undefined {
    return this._safeExecute(errorMessage, fn);
  }
}

const createTracerProvider = () => {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  return { exporter, provider };
};

const spanNames = (exporter: InMemorySpanExporter): string[] =>
  exporter.getFinishedSpans().map((span) => span.name);

// Filtered by namespace, because diag.setLogger() also logs a debug line.
const callsInNamespace = (
  stub: sinon.SinonStub,
  namespace: string,
): unknown[][] =>
  stub
    .getCalls()
    .map((call) => call.args)
    .filter(([callNamespace]) => callNamespace === namespace);

// Mirrors vitest's vi.waitFor defaults: retry every 50 ms for up to 1000 ms.
const waitFor = async (assertion: () => void): Promise<void> => {
  const deadline = Date.now() + 1000;
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
};

describe('InstrumentationBase', () => {
  let diagLogger: ReturnType<typeof setupTestDiagLogger>;

  beforeEach(() => {
    diagLogger = setupTestDiagLogger();
  });

  afterEach(() => {
    trace.disable();
    diag.disable();
    sinon.restore();
  });

  describe('constructor', () => {
    it('does not call any hook', () => {
      const probe = new Probe();

      expect(probe.initCount).to.equal(0);
      expect(probe.onEnableCount).to.equal(0);
      expect(probe.onDisableCount).to.equal(0);
      expect(probe.isEnabled()).to.equal(false);
    });

    it('does not read the global providers', () => {
      const getTracerProvider = sinon.spy(trace, 'getTracerProvider');

      new Probe();

      expect(getTracerProvider).to.have.callCount(0);
    });
  });

  describe('enable', () => {
    it('first enable runs _init once then _onEnable', () => {
      const probe = new Probe();

      probe.enable();

      expect(probe.initCount).to.equal(1);
      expect(probe.onEnableCount).to.equal(1);
      expect(probe.isEnabled()).to.equal(true);
    });

    it('a second enable does nothing', () => {
      const probe = new Probe();

      probe.enable();
      probe.enable();

      expect(probe.initCount).to.equal(1);
      expect(probe.onEnableCount).to.equal(1);
      expect(diagLogger.warn).not.to.have.been.called;
    });

    it('enable after disable runs only _onEnable', () => {
      const probe = new Probe();

      probe.enable();
      probe.disable();
      probe.enable();

      expect(probe.initCount).to.equal(1);
      expect(probe.onEnableCount).to.equal(2);
      expect(probe.isEnabled()).to.equal(true);
    });

    it('isEnabled() is true inside _onEnable', () => {
      const probe = new Probe();

      probe.enable();

      expect(probe.isEnabledInOnEnable).to.equal(true);
    });
  });

  describe('deps', () => {
    it('uses passed providers', () => {
      const { exporter, provider } = createTracerProvider();
      const probe = new Probe();

      probe.enable({ tracerProvider: provider });
      probe.emitSpan('passed');

      expect(spanNames(exporter)).to.deep.equal(['passed']);
    });

    it('uses a passed loggerProvider', () => {
      const exporter = new InMemoryLogRecordExporter();
      const loggerProvider = new LoggerProvider({
        processors: [new SimpleLogRecordProcessor({ exporter })],
      });
      const probe = new Probe();

      probe.enable({ loggerProvider });
      probe.emitLog('passed');

      expect(exporter.getFinishedLogRecords().map((r) => r.body)).to.deep.equal(
        ['passed'],
      );
    });

    it('tracer before the first enable() throws', () => {
      const probe = new Probe();

      expect(() => probe.emitSpan('early')).to.throw(
        /not available until enable\(\) succeeds/,
      );
    });

    it('falls back to the global proxy', () => {
      const probe = new Probe();
      probe.enable();

      const { exporter, provider } = createTracerProvider();
      trace.setGlobalTracerProvider(provider);
      probe.emitSpan('late-global');

      expect(spanNames(exporter)).to.deep.equal(['late-global']);
    });

    it('different deps passed to a later enable are ignored with a warning', () => {
      const first = createTracerProvider();
      const second = createTracerProvider();
      const probe = new Probe();

      probe.enable({ tracerProvider: first.provider });
      probe.disable();
      probe.enable({ tracerProvider: second.provider });
      probe.emitSpan('after-second-enable');

      expect(probe.isEnabled()).to.equal(true);
      expect(spanNames(first.exporter)).to.deep.equal(['after-second-enable']);
      expect(spanNames(second.exporter)).to.deep.equal([]);
      expect(diagLogger.warn).to.have.callCount(1);
      expect(diagLogger.warn).to.have.been.calledWithExactly(
        'test',
        sinon.match('ignored: tracerProvider'),
      );
    });

    it('deps passed to an instance enabled without deps are ignored with a warning', () => {
      const { exporter, provider } = createTracerProvider();
      const probe = new Probe();

      probe.enable();
      probe.enable({ tracerProvider: provider });
      probe.emitSpan('global');

      expect(spanNames(exporter)).to.deep.equal([]);
      expect(diagLogger.warn).to.have.been.calledWithExactly(
        'test',
        sinon.match('ignored: tracerProvider'),
      );
    });

    it('the same deps passed to a later enable are logged at debug only', () => {
      const { provider } = createTracerProvider();
      const probe = new Probe();

      probe.enable({ tracerProvider: provider });
      probe.enable({ tracerProvider: provider });

      expect(probe.onEnableCount).to.equal(1);
      expect(diagLogger.warn).not.to.have.been.called;
      const debugCalls = callsInNamespace(diagLogger.debug, 'test');
      expect(debugCalls).to.have.length(1);
      expect(debugCalls[0]).to.have.length(2);
      expect(debugCalls[0]?.[1]).to.match(/enable\(\) ignores deps/);
    });

    it('propagator defaults to the global propagation API', () => {
      const probe = new Probe();

      probe.enable();

      expect(probe.exposedPropagator()).to.equal(propagation);
    });
  });

  describe('disable', () => {
    it('before enable does nothing', () => {
      const probe = new Probe();

      probe.disable();
      expect(probe.onDisableCount).to.equal(0);

      probe.enable();
      expect(probe.initCount).to.equal(1);
      expect(probe.isEnabled()).to.equal(true);
    });

    it('after enable runs _onDisable and isEnabled() is false', () => {
      const probe = new Probe();

      probe.enable();
      probe.disable();

      expect(probe.onDisableCount).to.equal(1);
      expect(probe.isEnabled()).to.equal(false);
    });

    it('twice runs _onDisable once', () => {
      const probe = new Probe();

      probe.enable();
      probe.disable();
      probe.disable();

      expect(probe.onDisableCount).to.equal(1);
    });
  });

  describe('failures', () => {
    it('_init throws: state failed, one error with cause, later enable does nothing', () => {
      const probe = new Probe();
      probe.initError = new Error('cannot patch');

      probe.enable();
      probe.enable();

      expect(probe.initCount).to.equal(1);
      expect(probe.onEnableCount).to.equal(0);
      expect(probe.isEnabled()).to.equal(false);
      expect(diagLogger.error).to.have.callCount(1);
      expect(diagLogger.error).to.have.been.calledWithExactly(
        'test',
        sinon.match('cannot patch'),
        probe.initError,
      );
      // The ignored second call is traceable at debug level only.
      const debugCalls = callsInNamespace(diagLogger.debug, 'test');
      expect(debugCalls).to.have.length(1);
      expect(debugCalls[0]).to.have.length(2);
      expect(debugCalls[0]?.[1]).to.match(/enable\(\) ignored.*failed earlier/);
    });

    it('_init throws a non-Error: logged as an Error with the value as cause', () => {
      const probe = new Probe();
      probe.initError = 'cannot patch';

      probe.enable();

      expect(diagLogger.error).to.have.been.calledWithExactly(
        'test',
        sinon.match('cannot patch'),
        sinon.match({ cause: 'cannot patch' }),
      );
    });

    it('_onEnable throws a non-Error: logged as an Error with the value as cause', () => {
      const probe = new Probe();
      probe.onEnableError = 'enable broke';

      probe.enable();

      expect(diagLogger.error).to.have.been.calledWithExactly(
        'test',
        sinon.match('enable broke'),
        sinon.match({ cause: 'enable broke' }),
      );
    });

    it('a provider that throws from getTracer leaves the instance failed, logs an error, and enable() does not throw', () => {
      const probe = new Probe();
      const tracerProvider = {
        getTracer: sinon.spy(() => {
          throw new Error('no tracer');
        }),
      };

      expect(() => probe.enable({ tracerProvider })).not.to.throw();

      expect(probe.initCount).to.equal(0);
      expect(probe.isEnabled()).to.equal(false);
      expect(diagLogger.error).to.have.callCount(1);
      expect(diagLogger.error).to.have.been.calledWithExactly(
        'test',
        sinon.match(/tracer and logger.*stays off.*no tracer/),
        sinon.match({ message: 'no tracer' }),
      );
      expect(() => probe.emitSpan('late')).to.throw(
        /not available until enable\(\) succeeds/,
      );

      probe.enable({ tracerProvider });

      expect(tracerProvider.getTracer).to.have.callCount(1);
      expect(probe.initCount).to.equal(0);
      expect(probe.isEnabled()).to.equal(false);
      expect(diagLogger.error).to.have.callCount(1);
    });

    it('_onEnable throws: rolled back through _onDisable, error, a later enable retries', () => {
      const probe = new Probe();
      probe.onEnableError = new Error('enable broke');

      probe.enable();

      expect(probe.isEnabled()).to.equal(false);
      expect(probe.onDisableCount).to.equal(1);
      expect(diagLogger.error).to.have.callCount(1);
      expect(diagLogger.error).to.have.been.calledWithExactly(
        'test',
        sinon.match('enable broke'),
        probe.onEnableError,
      );

      probe.onEnableError = undefined;
      probe.enable();

      expect(probe.isEnabled()).to.equal(true);
      expect(probe.initCount).to.equal(1);
      expect(probe.onEnableCount).to.equal(2);
    });

    it('_onEnable and the rollback _onDisable both throw: enable error is logged first', () => {
      const probe = new Probe();
      probe.onEnableError = new Error('enable broke');
      probe.onDisableError = new Error('cleanup broke');

      expect(() => probe.enable()).not.to.throw();

      expect(probe.isEnabled()).to.equal(false);
      expect(diagLogger.error).to.have.callCount(2);
      expect(diagLogger.error.getCall(0)).to.have.been.calledWithExactly(
        'test',
        sinon.match('enable broke'),
        probe.onEnableError,
      );
      expect(diagLogger.error.getCall(1)).to.have.been.calledWithExactly(
        'test',
        sinon.match(/disable failed.*cleanup broke/),
        probe.onDisableError,
      );

      probe.onEnableError = undefined;
      probe.onDisableError = undefined;
      probe.enable();

      expect(probe.isEnabled()).to.equal(false);
      expect(probe.onEnableCount).to.equal(1);
    });

    it('_onDisable throws: logged with its message, state failed, a later enable does nothing', () => {
      const probe = new Probe();
      probe.onDisableError = new Error('cleanup broke');
      probe.enable();

      expect(() => probe.disable()).not.to.throw();

      expect(probe.isEnabled()).to.equal(false);
      expect(diagLogger.error).to.have.been.calledWithExactly(
        'test',
        sinon.match(/disable failed.*stays off.*cleanup broke/),
        probe.onDisableError,
      );

      probe.onDisableError = undefined;
      probe.enable();
      probe.disable();

      expect(probe.isEnabled()).to.equal(false);
      expect(probe.onEnableCount).to.equal(1);
      expect(probe.onDisableCount).to.equal(1);
    });

    it('a provider that throws from getLogger leaves the instance failed before _init runs', () => {
      const probe = new Probe();
      const loggerProvider = {
        getLogger: sinon.spy(() => {
          throw new Error('no logger');
        }),
      };

      expect(() => probe.enable({ loggerProvider })).not.to.throw();

      expect(probe.initCount).to.equal(0);
      expect(probe.isEnabled()).to.equal(false);
      expect(diagLogger.error).to.have.been.calledWithExactly(
        'test',
        sinon.match(/stays off.*no logger/),
        sinon.match({ message: 'no logger' }),
      );
    });
  });

  describe('_wrap', () => {
    it('replaces the slot with the wrapper and keeps the original', () => {
      const probe = new WrapProbe('test', '1.0.0', {});
      const target: { greet: () => string } = {
        greet: () => 'original',
      };

      probe.wrap(target, 'greet', (original) => () => `wrapped:${original()}`);

      expect(target.greet()).to.equal('wrapped:original');
      const original = (target.greet as { __original?: () => string })
        .__original;
      expect(original?.()).to.equal('original');
    });

    it('keeps an enumerable own slot enumerable', () => {
      const probe = new WrapProbe('test', '1.0.0', {});
      const target: { greet: () => string } = { greet: () => 'original' };

      probe.wrap(target, 'greet', (original) => () => `wrapped:${original()}`);

      expect(Object.keys(target)).to.deep.equal(['greet']);
    });

    it('replaces a non-writable slot', () => {
      const probe = new WrapProbe('test', '1.0.0', {});
      const target = {} as { greet: () => string };
      // The shape a third-party patch leaves behind: defined, not assigned, so
      // `writable` defaults to false. Assignment would throw here.
      Object.defineProperty(target, 'greet', {
        value: () => 'original',
        configurable: true,
      });

      probe.wrap(target, 'greet', (original) => () => `wrapped:${original()}`);

      expect(target.greet()).to.equal('wrapped:original');
    });

    it('replaces an accessor whose setter ignores writes', () => {
      const probe = new WrapProbe('test', '1.0.0', {});
      const original = () => 'original';
      const target = {} as { greet: () => string };
      // Assignment against this setter succeeds and changes nothing, which would
      // leave the caller believing the patch landed.
      Object.defineProperty(target, 'greet', {
        get: () => original,
        set: () => {},
        configurable: true,
      });

      probe.wrap(target, 'greet', (o) => () => `wrapped:${o()}`);

      expect(target.greet()).to.equal('wrapped:original');
    });

    it('throws when the slot is non-configurable', () => {
      const probe = new WrapProbe('test', '1.0.0', {});
      const target = {} as { greet: () => string };
      Object.defineProperty(target, 'greet', {
        value: () => 'original',
        configurable: false,
      });

      expect(() =>
        probe.wrap(
          target,
          'greet',
          (original) => () => `wrapped:${original()}`,
        ),
      ).to.throw();
      expect(target.greet()).to.equal('original');
    });

    it('throws and leaves the slot alone when it is not a function', () => {
      const probe = new WrapProbe('test', '1.0.0', {});
      const target = {} as { greet?: () => string };

      expect(() => probe.wrap(target, 'greet', () => () => 'wrapped')).to.throw(
        /not a function/,
      );
      expect('greet' in target).to.equal(false);
    });

    it('offers no way to unwrap', () => {
      const probe = new WrapProbe('test', '1.0.0', {});

      // Other code may have wrapped on top of ours, so restoring is not safe.
      expect(Reflect.has(probe, '_unwrap')).to.equal(false);
      expect(Reflect.has(probe, '_massUnwrap')).to.equal(false);
    });
  });

  describe('_safeExecute', () => {
    it('returns the result, or undefined and a diag error on throw', () => {
      const probe = new WrapProbe('test', '1.0.0', {});

      expect(probe.exposedSafeExecute('hook failed', () => 42)).to.equal(42);

      const thrown = new Error('boom');
      expect(
        probe.exposedSafeExecute('hook failed', () => {
          throw thrown;
        }),
      ).to.equal(undefined);
      expect(diagLogger.error).to.have.been.calledWithExactly(
        'test',
        'hook failed',
        thrown,
      );
    });

    it('logs a rejected Promise and returns it unchanged', async () => {
      const probe = new WrapProbe('test', '1.0.0', {});
      const rejected = new Error('late boom');
      const promise = Promise.reject(rejected);

      expect(probe.exposedSafeExecute('hook failed', () => promise)).to.equal(
        promise,
      );

      await waitFor(() =>
        expect(diagLogger.error).to.have.been.calledWithExactly(
          'test',
          'hook failed',
          rejected,
        ),
      );
      expect(diagLogger.error).to.have.callCount(1);
    });

    it('logs nothing for a Promise that resolves', async () => {
      const probe = new WrapProbe('test', '1.0.0', {});

      await probe.exposedSafeExecute('hook failed', () => Promise.resolve(1));
      await new Promise((resolve) => setTimeout(resolve));

      expect(diagLogger.error).not.to.have.been.called;
    });

    it('logs a throw from an async fn', async () => {
      const probe = new WrapProbe('test', '1.0.0', {});
      const thrown = new Error('async boom');

      probe.exposedSafeExecute('hook failed', async () => {
        throw thrown;
      });

      await waitFor(() =>
        expect(diagLogger.error).to.have.been.calledWithExactly(
          'test',
          'hook failed',
          thrown,
        ),
      );
    });

    it('logs a rejected thenable that is not a native Promise', async () => {
      const probe = new WrapProbe('test', '1.0.0', {});
      const rejected = new Error('thenable boom');
      const thenable = {
        // biome-ignore lint/suspicious/noThenProperty: the test needs a thenable
        then: (_onFulfilled: unknown, onRejected: (reason: unknown) => void) =>
          onRejected(rejected),
      };

      probe.exposedSafeExecute('hook failed', () => thenable);

      await waitFor(() =>
        expect(diagLogger.error).to.have.been.calledWithExactly(
          'test',
          'hook failed',
          rejected,
        ),
      );
    });

    it('logs a non-Error rejection as an Error with the value as cause', async () => {
      const probe = new WrapProbe('test', '1.0.0', {});

      probe.exposedSafeExecute('hook failed', () => Promise.reject('oops'));

      await waitFor(() =>
        expect(diagLogger.error).to.have.been.calledWithExactly(
          'test',
          'hook failed',
          sinon.match({ message: 'oops', cause: 'oops' }),
        ),
      );
    });
  });
});
