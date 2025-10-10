import * as chai from 'chai';
import { PageLogRecordProcessor } from './PageLogRecordProcessor.js';
import { setupTestLogExporter } from '../../testUtils/index.js';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { PageManager, Route } from '../../api-page/index.js';
import { KEY_EMB_PAGE_ID, KEY_EMB_PAGE_PATH } from '../../constants/index.js';
import { EmbracePageManager } from '../../managers/index.js';

const { expect } = chai;

describe('PageLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let pageManager: PageManager;
  let logger: Logger;

  const mockRoute: Route = {
    path: '/products/:id',
    url: '/products/123',
  };

  before(() => {
    pageManager = new EmbracePageManager();
    memoryExporter = setupTestLogExporter([
      new PageLogRecordProcessor({
        pageManager,
      }),
    ]);
    logger = logs.getLogger('test-logger');
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  it('should attach route when emitted a log', () => {
    pageManager.setCurrentRoute(mockRoute);

    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes[KEY_EMB_PAGE_ID]).to.equal(
      pageManager.getCurrentPageId()
    );
    expect(log.attributes[KEY_EMB_PAGE_PATH]).to.equal('/products/:id');
  });

  it('should not attach surface name and id when route is null', () => {
    pageManager.clearCurrentRoute();

    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    void expect(log.attributes[KEY_EMB_PAGE_ID]).to.be.undefined;
    void expect(log.attributes[KEY_EMB_PAGE_PATH]).to.be.undefined;
  });

  it('should make sure forceFlush no-op does not fail', () => {
    const processor = new PageLogRecordProcessor({
      pageManager: new EmbracePageManager(),
    });

    expect(async () => {
      await processor.forceFlush();
    }).to.not.throw();
  });

  it('should make sure shutdown no-op does not fail', () => {
    const processor = new PageLogRecordProcessor({
      pageManager: new EmbracePageManager(),
    });

    expect(async () => {
      await processor.shutdown();
    }).to.not.throw();
  });
});
