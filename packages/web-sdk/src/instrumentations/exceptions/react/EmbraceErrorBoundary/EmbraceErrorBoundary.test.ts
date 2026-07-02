import { SeverityNumber } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import type React from 'react';
import { TEST_DYNAMIC_CONFIG_MANAGER } from '../../../../../tests/utils/constants.ts';
import { setupTestLogExporter } from '../../../../../tests/utils/setupTestLogExporter.ts';
import { setupTestStorage } from '../../../../../tests/utils/setupTestStorage.ts';
import { log } from '../../../../api-logs/logAPI.ts';
import type { LogManager } from '../../../../api-logs/manager/types.ts';
import {
  EMB_ERROR_INSTRUMENTATIONS,
  KEY_EMB_INSTRUMENTATION,
  KEY_EMB_JS_FILE_BUNDLE_IDS,
} from '../../../../constants/attributes.ts';
import { DEFAULT_LIMITS } from '../../../../managers/EmbraceLimitManager/constants.ts';
import { EmbraceLimitManager } from '../../../../managers/EmbraceLimitManager/EmbraceLimitManager.ts';
import { EmbraceLogManager } from '../../../../managers/EmbraceLogManager/EmbraceLogManager.ts';
import { EmbraceUserSessionManager } from '../../../../managers/EmbraceUserSessionManager/EmbraceUserSessionManager.ts';
import { OTelPerformanceManager } from '../../../../utils/PerformanceManager/OTelPerformanceManager.ts';
import { EmbraceErrorBoundary } from './EmbraceErrorBoundary.ts';

const { expect } = chai;

type TestProps = {
  fallback: () => React.ReactNode;
  children?: React.ReactNode;
};

describe('EmbraceErrorBoundary', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let logManager: LogManager;
  let instrumentation: EmbraceErrorBoundary<TestProps>;

  before(() => {
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    const limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);
    const storage = setupTestStorage();
    const perf = new OTelPerformanceManager();
    logManager = new EmbraceLogManager({
      userSessionManager: new EmbraceUserSessionManager({
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
        limitManager,
        perf,
        storage,
        visibilityDoc: window.document,
      }),
      limitManager,
      perf,
      storage,
      visibilityDoc: window.document,
    });
    log.setGlobalLogManager(logManager);

    instrumentation = new EmbraceErrorBoundary({
      fallback: () => 'fallback',
      children: 'children',
    });
  });

  it('should catch an error and log an exception', () => {
    const error = new Error('Some error, at some component');
    const errorInfo = {
      componentStack: `
         in ComponentThatThrows (created by App)
         in EmbraceErrorBoundary (created by App)
         in div (created by App)
         in App
      `,
    };

    instrumentation.componentDidCatch(error, errorInfo);

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);

    const exceptionLog = finishedLogs[0];
    void expect(exceptionLog.severityNumber).to.be.equal(SeverityNumber.ERROR);
    void expect(exceptionLog.severityText).to.be.equal('ERROR');
    void expect(exceptionLog.body).to.be.equal('Some error, at some component');
    void expect(exceptionLog.attributes).to.deep.equal({
      'emb.type': 'sys.exception',
      'emb.exception_cause': '',
      'emb.exception_handling': 'unhandled',
      'exception.type': 'Error',
      'exception.name': 'Error',
      'exception.message': 'Some error, at some component',
      'exception.stacktrace': error.stack,
      'react.component_stack': errorInfo.componentStack,
      [KEY_EMB_INSTRUMENTATION]: EMB_ERROR_INSTRUMENTATIONS.ReactErrorBoundary,
      [KEY_EMB_JS_FILE_BUNDLE_IDS]: '{}',
      'emb.state': 'foreground',
      'emb.exception_number': 1,
    });
  });

  it('should render the fallback when it has an error', () => {
    let rendered = instrumentation.render();

    expect(rendered).to.equal('children');

    instrumentation.state = EmbraceErrorBoundary.getDerivedStateFromError();
    rendered = instrumentation.render();

    expect(rendered).to.equal('fallback');
  });
});
