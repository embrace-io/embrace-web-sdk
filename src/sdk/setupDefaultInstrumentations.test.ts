import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { LogManager } from '../api-logs/index.ts';
import type { SpanSessionManager } from '../api-sessions/index.ts';
import {
  ClicksInstrumentation,
  DocumentLoadInstrumentation,
  EmbraceFetchInstrumentation,
  EmbraceInstrumentationBase,
  EmbraceXHRInstrumentation,
  EmptyRootInstrumentation,
  GlobalExceptionInstrumentation,
  SpanSessionBrowserActivityInstrumentation,
  SpanSessionOnLoadInstrumentation,
  SpanSessionTimeoutInstrumentation,
  SpanSessionVisibilityInstrumentation,
  WebVitalsInstrumentation,
} from '../instrumentations/index.ts';
import type { SDKFeaturesManager } from '../managers/index.ts';
import type { EmbraceSessionBatchedSpanProcessor } from '../processors/index.ts';
import { setupDefaultInstrumentations } from './setupDefaultInstrumentations.ts';
import type { SetupDefaultInstrumentationsArgs } from './types.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('setupDefaultInstrumentations', () => {
  let mockFeatureManager: SDKFeaturesManager;
  let mockLogManager: LogManager;
  let mockSpanSessionManager: SpanSessionManager;
  let mockEmbraceSpanProcessor: EmbraceSessionBatchedSpanProcessor;
  let defaultArgs: SetupDefaultInstrumentationsArgs;

  beforeEach(() => {
    mockFeatureManager = {
      isEmptySessionAvoidanceEnabled: () => false,
    } as SDKFeaturesManager;

    mockLogManager = {
      message: sinon.stub(),
      logException: sinon.stub(),
    } as unknown as LogManager;

    mockSpanSessionManager = {
      startSessionSpan: sinon.stub(),
      endSessionSpan: sinon.stub(),
      getActiveSessionSpan: sinon.stub(),
      setSessionProperty: sinon.stub(),
      addBreadcrumb: sinon.stub(),
    } as unknown as SpanSessionManager;

    mockEmbraceSpanProcessor = {
      forceFlush: sinon.stub(),
    } as unknown as EmbraceSessionBatchedSpanProcessor;

    defaultArgs = {
      featureManager: mockFeatureManager,
      logManager: mockLogManager,
      spanSessionManager: mockSpanSessionManager,
      embraceSpanProcessor: mockEmbraceSpanProcessor,
    };
  });

  describe('default configuration', () => {
    it('should return all core instrumentations with default config', () => {
      const instrumentations = setupDefaultInstrumentations({}, defaultArgs);

      // Session instrumentations (always included)
      expect(
        instrumentations.some(
          (i) => i instanceof SpanSessionOnLoadInstrumentation,
        ),
      ).to.be.true;
      expect(
        instrumentations.some(
          (i) => i instanceof SpanSessionVisibilityInstrumentation,
        ),
      ).to.be.true;
      expect(
        instrumentations.some(
          (i) => i instanceof SpanSessionBrowserActivityInstrumentation,
        ),
      ).to.be.true;
      expect(
        instrumentations.some(
          (i) => i instanceof SpanSessionTimeoutInstrumentation,
        ),
      ).to.be.true;

      // Optional instrumentations (included by default)
      expect(
        instrumentations.some(
          (i) => i instanceof GlobalExceptionInstrumentation,
        ),
      ).to.be.true;
      expect(instrumentations.some((i) => i instanceof ClicksInstrumentation))
        .to.be.true;
      expect(
        instrumentations.some((i) => i instanceof WebVitalsInstrumentation),
      ).to.be.true;
      expect(
        instrumentations.some((i) => i instanceof DocumentLoadInstrumentation),
      ).to.be.true;
      expect(
        instrumentations.some((i) => i instanceof EmbraceFetchInstrumentation),
      ).to.be.true;
      expect(
        instrumentations.some((i) => i instanceof EmbraceXHRInstrumentation),
      ).to.be.true;
    });

    it('should not include empty-root instrumentation by default', () => {
      const instrumentations = setupDefaultInstrumentations({}, defaultArgs);

      expect(
        instrumentations.some((i) => i instanceof EmptyRootInstrumentation),
      ).to.be.false;
    });
  });

  describe('omit configuration', () => {
    it('should exclude exception instrumentation when omitted', () => {
      const instrumentations = setupDefaultInstrumentations(
        { omit: new Set(['exception']) },
        defaultArgs,
      );

      expect(
        instrumentations.some(
          (i) => i instanceof GlobalExceptionInstrumentation,
        ),
      ).to.be.false;
    });

    it('should exclude click instrumentation when omitted', () => {
      const instrumentations = setupDefaultInstrumentations(
        { omit: new Set(['click']) },
        defaultArgs,
      );

      expect(instrumentations.some((i) => i instanceof ClicksInstrumentation))
        .to.be.false;
    });

    it('should exclude web-vital instrumentation when omitted', () => {
      const instrumentations = setupDefaultInstrumentations(
        { omit: new Set(['web-vital']) },
        defaultArgs,
      );

      expect(
        instrumentations.some((i) => i instanceof WebVitalsInstrumentation),
      ).to.be.false;
    });

    it('should exclude document-load instrumentation when omitted', () => {
      const instrumentations = setupDefaultInstrumentations(
        { omit: new Set(['document-load']) },
        defaultArgs,
      );

      expect(
        instrumentations.some((i) => i instanceof DocumentLoadInstrumentation),
      ).to.be.false;
    });

    it('should exclude fetch instrumentation when omitted', () => {
      const instrumentations = setupDefaultInstrumentations(
        { omit: new Set(['@opentelemetry/instrumentation-fetch']) },
        defaultArgs,
      );

      expect(
        instrumentations.some((i) => i instanceof EmbraceFetchInstrumentation),
      ).to.be.false;
    });

    it('should exclude xhr instrumentation when omitted', () => {
      const instrumentations = setupDefaultInstrumentations(
        { omit: new Set(['@opentelemetry/instrumentation-xml-http-request']) },
        defaultArgs,
      );

      expect(
        instrumentations.some((i) => i instanceof EmbraceXHRInstrumentation),
      ).to.be.false;
    });

    it('should exclude multiple instrumentations when specified', () => {
      const instrumentations = setupDefaultInstrumentations(
        { omit: new Set(['exception', 'click', 'web-vital']) },
        defaultArgs,
      );

      expect(
        instrumentations.some(
          (i) => i instanceof GlobalExceptionInstrumentation,
        ),
      ).to.be.false;
      expect(instrumentations.some((i) => i instanceof ClicksInstrumentation))
        .to.be.false;
      expect(
        instrumentations.some((i) => i instanceof WebVitalsInstrumentation),
      ).to.be.false;
    });
  });

  describe('session instrumentations', () => {
    it('should always include session instrumentations regardless of omit', () => {
      const instrumentations = setupDefaultInstrumentations(
        {
          omit: new Set([
            'exception',
            'click',
            'web-vital',
            'document-load',
            '@opentelemetry/instrumentation-fetch',
            '@opentelemetry/instrumentation-xml-http-request',
          ]),
        },
        defaultArgs,
      );

      expect(
        instrumentations.some(
          (i) => i instanceof SpanSessionOnLoadInstrumentation,
        ),
      ).to.be.true;
      expect(
        instrumentations.some(
          (i) => i instanceof SpanSessionVisibilityInstrumentation,
        ),
      ).to.be.true;
      expect(
        instrumentations.some(
          (i) => i instanceof SpanSessionBrowserActivityInstrumentation,
        ),
      ).to.be.true;
      expect(
        instrumentations.some(
          (i) => i instanceof SpanSessionTimeoutInstrumentation,
        ),
      ).to.be.true;
    });
  });

  describe('setSessionManager and setLogManager', () => {
    it('should call setSessionManager on EmbraceInstrumentationBase instances', () => {
      const instrumentations = setupDefaultInstrumentations({}, defaultArgs);

      const embraceInstrumentations = instrumentations.filter(
        (i) => i instanceof EmbraceInstrumentationBase,
      );

      // All EmbraceInstrumentationBase instances should have setSessionManager called
      expect(embraceInstrumentations.length).to.be.greaterThan(0);
    });

    it('should call setLogManager on EmbraceInstrumentationBase instances', () => {
      const instrumentations = setupDefaultInstrumentations({}, defaultArgs);

      const embraceInstrumentations = instrumentations.filter(
        (i) => i instanceof EmbraceInstrumentationBase,
      );

      expect(embraceInstrumentations.length).to.be.greaterThan(0);
    });
  });

  describe('handling missing managers', () => {
    it('should handle missing logManager', () => {
      const argsWithoutLogManager: SetupDefaultInstrumentationsArgs = {
        featureManager: mockFeatureManager,
        spanSessionManager: mockSpanSessionManager,
        embraceSpanProcessor: mockEmbraceSpanProcessor,
      };

      expect(() =>
        setupDefaultInstrumentations({}, argsWithoutLogManager),
      ).to.not.throw();
    });

    it('should handle missing spanSessionManager', () => {
      const argsWithoutSessionManager: SetupDefaultInstrumentationsArgs = {
        featureManager: mockFeatureManager,
        logManager: mockLogManager,
        embraceSpanProcessor: mockEmbraceSpanProcessor,
      };

      expect(() =>
        setupDefaultInstrumentations({}, argsWithoutSessionManager),
      ).to.not.throw();
    });

    it('should handle all optional managers missing', () => {
      const minimalArgs: SetupDefaultInstrumentationsArgs = {
        featureManager: mockFeatureManager,
      };

      expect(() =>
        setupDefaultInstrumentations({}, minimalArgs),
      ).to.not.throw();
    });
  });
});
