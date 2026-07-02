import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import { setupTestLogExporter } from '../../../tests/utils/setupTestLogExporter.ts';
import { setupTestStorage } from '../../../tests/utils/setupTestStorage.ts';
import type { UserManager } from '../../api-users/manager/types.ts';
import { EmbraceUserManager } from '../../managers/EmbraceUserManager/EmbraceUserManager.ts';
import { UserLogRecordProcessor } from './UserLogRecordProcessor.ts';

const { expect } = chai;

describe('UserLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let userManager: UserManager;
  let logger: Logger;

  before(() => {
    userManager = new EmbraceUserManager({ storage: setupTestStorage() });
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
