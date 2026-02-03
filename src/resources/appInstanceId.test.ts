import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../tests/utils/index.ts';
import { getAppInstanceId } from './appInstanceId.ts';
import { EMBRACE_APP_INSTANCE_ID_STORAGE_KEY } from './constants/index.ts';

chai.use(sinonChai);
const { expect } = chai;

// UUID format: 32 uppercase hex characters without hyphens
const UUID_REGEX = /^[0-9A-F]{32}$/;

describe('getAppInstanceId', () => {
  let storage: InMemoryStorage;
  let diag: InMemoryDiagLogger;

  beforeEach(() => {
    storage = new InMemoryStorage();
    diag = new InMemoryDiagLogger();
  });

  it('should retrieve existing ID from session storage', () => {
    const existingId = '12345678-1234-4123-8123-123456789012';
    storage.setItem(EMBRACE_APP_INSTANCE_ID_STORAGE_KEY, existingId);

    const result = getAppInstanceId(storage, diag);

    expect(result).to.equal(existingId);
    expect(diag.getDebugLogs()).to.have.lengthOf(0);
  });

  it('should create ID when none exists in storage', () => {
    const result = getAppInstanceId(storage, diag);

    expect(result).to.match(UUID_REGEX);
    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.include('No existing app instance ID');
  });

  it('should persist ID to session storage', () => {
    const result = getAppInstanceId(storage, diag);

    const storedId = storage.getItem(EMBRACE_APP_INSTANCE_ID_STORAGE_KEY);
    expect(storedId).to.equal(result);
  });

  it('should handle storage.getItem error gracefully', () => {
    const failingStorage = new FailingStorage();

    const result = getAppInstanceId(failingStorage, diag);

    // Should still generate a valid UUID
    expect(result).to.match(UUID_REGEX);
    expect(diag.getWarnLogs()).to.have.lengthOf(2);
    expect(diag.getWarnLogs()[0]).to.include(
      'Failed to retrieve app instance ID',
    );
  });

  it('should handle storage.setItem error gracefully', () => {
    // Create storage that fails on setItem but succeeds on getItem
    const partialFailingStorage: Storage = {
      ...new InMemoryStorage(),
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };

    const result = getAppInstanceId(partialFailingStorage, diag);

    // Should still return a valid UUID
    expect(result).to.match(UUID_REGEX);
    expect(diag.getWarnLogs()).to.have.lengthOf(1);
    expect(diag.getWarnLogs()[0]).to.include(
      'Failed to persist app instance ID',
    );
  });

  it('should generate valid UUID format', () => {
    const result = getAppInstanceId(storage, diag);

    // Check uppercase hex format without hyphens
    expect(result).to.match(UUID_REGEX);
    expect(result).to.have.lengthOf(32);
    expect(result).to.equal(result.toUpperCase());
  });

  it('should return same ID on subsequent calls with same storage', () => {
    const firstResult = getAppInstanceId(storage, diag);
    const secondResult = getAppInstanceId(storage, diag);

    expect(firstResult).to.equal(secondResult);
  });

  it('should return different IDs with fresh storage', () => {
    const firstStorage = new InMemoryStorage();
    const secondStorage = new InMemoryStorage();

    const firstResult = getAppInstanceId(firstStorage, diag);
    const secondResult = getAppInstanceId(secondStorage, diag);

    expect(firstResult).to.not.equal(secondResult);
  });
});
