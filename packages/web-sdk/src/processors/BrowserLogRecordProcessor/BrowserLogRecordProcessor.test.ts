import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import { setupTestLogExporter } from '../../../tests/utils/index.ts';
import type { URLDocument } from '../../common/index.ts';
import { KEY_BROWSER_URL_FULL } from '../../constants/index.ts';
import { BrowserLogRecordProcessor } from './BrowserLogRecordProcessor.ts';

const { expect } = chai;

const urlDocument: URLDocument = {
  URL: 'https://example.com/products/123',
};

describe('BrowserLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let logger: Logger;

  before(() => {
    memoryExporter = setupTestLogExporter([
      new BrowserLogRecordProcessor({ urlDocument }),
    ]);
    logger = logs.getLogger('test-logger');
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  it('should attach browser.url.full when a log is emitted', () => {
    logger.emit({ body: 'some log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes[KEY_BROWSER_URL_FULL]).to.equal(urlDocument.URL);
  });

  it('should reflect the current url at emit time', () => {
    const mutableDocument: URLDocument = { URL: 'https://example.com/page-1' };
    const exporter = setupTestLogExporter([
      new BrowserLogRecordProcessor({ urlDocument: mutableDocument }),
    ]);
    const localLogger = logs.getLogger('test-logger-mutable');

    mutableDocument.URL = 'https://example.com/page-2';
    localLogger.emit({ body: 'some log' });

    const finishedLogs = exporter.getFinishedLogRecords();
    const log = finishedLogs[finishedLogs.length - 1];

    expect(log.attributes[KEY_BROWSER_URL_FULL]).to.equal(
      'https://example.com/page-2',
    );
  });

  it('should make sure forceFlush no-op does not fail', () => {
    const processor = new BrowserLogRecordProcessor({ urlDocument });

    expect(async () => {
      await processor.forceFlush();
    }).to.not.throw();
  });

  it('should make sure shutdown no-op does not fail', () => {
    const processor = new BrowserLogRecordProcessor({ urlDocument });

    expect(async () => {
      await processor.shutdown();
    }).to.not.throw();
  });
});
