import * as chai from 'chai';
import { EmbraceErrorBoundary } from './EmbraceErrorBoundary.js';
import type { LogManager } from '../../../../api-logs/index.js';
import { log } from '../../../../api-logs/index.js';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { setupTestLogExporter } from '../../../../testUtils/index.js';
import {
  EmbraceLogManager,
  EmbraceSpanSessionManager,
} from '../../../../managers/index.js';
import type React from 'react';
import { SeverityNumber } from '@opentelemetry/api-logs';
import {
  EMB_ERROR_INSTRUMENTATIONS,
  KEY_EMB_INSTRUMENTATION,
} from '../../../../constants/attributes.js';

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
    logManager = new EmbraceLogManager({
      spanSessionManager: new EmbraceSpanSessionManager(),
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
      'emb.exception_handling': 'UNHANDLED',
      'exception.type': 'Error',
      'exception.name': 'Error',
      'exception.message': 'Some error, at some component',
      'exception.stacktrace': error.stack,
      'react.component_stack': errorInfo.componentStack,
      [KEY_EMB_INSTRUMENTATION]: EMB_ERROR_INSTRUMENTATIONS.ReactErrorBoundary,
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
