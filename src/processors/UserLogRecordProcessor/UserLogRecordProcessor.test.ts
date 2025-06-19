import * as chai from 'chai';
import { UserLogRecordProcessor } from './UserLogRecordProcessor.js';
import {
  InMemoryStorage,
  setupTestLogExporter,
} from '../../testUtils/index.js';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { EmbraceUserManager } from '../../managers/index.js';
import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { UserManager } from '../../api-users/index.js';

const { expect } = chai;

describe('UserLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let userManager: UserManager;
  let logger: Logger;

  before(() => {
    userManager = new EmbraceUserManager({
      storage: new InMemoryStorage(),
    });
    memoryExporter = setupTestLogExporter([
      new UserLogRecordProcessor({
        userManager,
      }),
    ]);
    logger = logs.getLogger('test-logger');
  });

  afterEach(() => {
    memoryExporter.reset();
    userManager.clearUserId();
  });

  it('should attach the userId when available', () => {
    userManager.setUserId('test-user-id');

    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['user.id']).to.be.equal('test-user-id');
  });

  it('should handle the userId not being available', () => {
    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    void expect(log.attributes['user.id']).to.be.undefined;
  });
});
