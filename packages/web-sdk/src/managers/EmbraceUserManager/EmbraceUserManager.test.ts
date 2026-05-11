import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../../tests/utils/index.ts';
import { NamespacedStorage } from '../../utils/index.ts';

import {
  EMBRACE_EXTERNAL_USER_ID_KEY,
  EMBRACE_USER_ID_STORAGE_KEY,
} from './constants.ts';
import { EmbraceUserManager } from './EmbraceUserManager.ts';

chai.use(sinonChai);
const { expect } = chai;

const VALID_UUID = 'aaaaBBBBccccDDDDeeeeFFFFggggHHHH';

describe('EmbraceUserManager', () => {
  let inMemoryStorage: InMemoryStorage;
  let storage: NamespacedStorage;
  let diag: InMemoryDiagLogger;

  beforeEach(() => {
    inMemoryStorage = new InMemoryStorage();
    diag = new InMemoryDiagLogger();
    storage = new NamespacedStorage({ storage: inMemoryStorage, diag });
  });

  it('should initialize a EmbraceUserManager', () => {
    const manager = new EmbraceUserManager({ diag, storage });
    expect(manager).to.be.instanceOf(EmbraceUserManager);
  });

  it('should generate an embrace user id if there is not one in storage', () => {
    const manager = new EmbraceUserManager({ diag, storage });
    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'No existing user found in storage, creating a new one',
    );
    expect(manager.getEmbraceUserId()).to.have.lengthOf(32);
  });

  it('should restore an embrace user id if there is one in storage', () => {
    storage.setItem(EMBRACE_USER_ID_STORAGE_KEY, VALID_UUID);

    const manager = new EmbraceUserManager({ diag, storage });
    expect(manager.getEmbraceUserId()).to.be.equal(VALID_UUID);
  });

  it('should allow the embrace user id to be cleared', () => {
    storage.setItem(EMBRACE_USER_ID_STORAGE_KEY, VALID_UUID);

    const manager = new EmbraceUserManager({ diag, storage });
    expect(manager.getEmbraceUserId()).to.be.equal(VALID_UUID);

    manager.clearEmbraceUserId();
    void expect(storage.getItem(EMBRACE_USER_ID_STORAGE_KEY)).to.be.null;

    // Since the user was cleared from storage a new ID should be generated for the next manager
    const nextManager = new EmbraceUserManager({ diag, storage });
    expect(manager.getEmbraceUserId()).not.to.equal(VALID_UUID);
    expect(nextManager.getEmbraceUserId()).to.have.lengthOf(32);
  });

  it('should handle parsing an invalid user from storage', () => {
    storage.setItem(EMBRACE_USER_ID_STORAGE_KEY, 'some-invalid-uuid');

    const manager = new EmbraceUserManager({ diag, storage });
    expect(diag.getWarnLogs()).to.have.lengthOf(1);
    expect(diag.getWarnLogs()[0]).to.equal(
      'Invalid embrace user id, generating a new one',
    );
    expect(manager.getEmbraceUserId()).to.have.lengthOf(32);
  });

  it('should handle its storage throwing errors', () => {
    const manager = new EmbraceUserManager({
      diag,
      storage: new NamespacedStorage({ storage: new FailingStorage(), diag }),
    });
    expect(manager.getEmbraceUserId()).to.have.lengthOf(32);
    manager.clearEmbraceUserId();
    // First write attempt during construction flips the wrapper to disabled
    // and emits a single error; subsequent writes are silent.
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('writes disabled');
    // Reads still warn each time they fail.
    expect(
      diag
        .getWarnLogs()
        .every(
          (m) => m.includes('failed to read') || m.includes('failed to remove'),
        ),
    ).to.equal(true);
  });

  it('should get an external user id', () => {
    const manager = new EmbraceUserManager({ diag, storage });
    const externalUserId = 'external-user-id-123';

    storage.setItem(EMBRACE_EXTERNAL_USER_ID_KEY, externalUserId);
    expect(manager.getUserId()).to.equal(externalUserId);
  });

  it('should set an external user id', () => {
    const manager = new EmbraceUserManager({ diag, storage });
    const externalUserId = 'external-user-id-123';

    manager.setUserId(externalUserId);
    expect(storage.getItem(EMBRACE_EXTERNAL_USER_ID_KEY)).to.equal(
      externalUserId,
    );
    expect(manager.getUserId()).to.equal(externalUserId);
  });

  it('should clear an external user id', () => {
    const manager = new EmbraceUserManager({ diag, storage });
    const externalUserId = 'external-user-id-123';

    manager.setUserId(externalUserId);
    expect(storage.getItem(EMBRACE_EXTERNAL_USER_ID_KEY)).to.equal(
      externalUserId,
    );

    manager.clearUserId();
    void expect(storage.getItem(EMBRACE_EXTERNAL_USER_ID_KEY)).to.be.null;
    void expect(manager.getUserId()).to.be.null;
  });

  it('should handle getting an external user id when storage is failing', () => {
    const manager = new EmbraceUserManager({
      diag,
      storage: new NamespacedStorage({ storage: new FailingStorage(), diag }),
    });
    diag.clear();

    expect(manager.getUserId()).to.equal(null);

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.have.lengthOf(1);
    expect(warningLogs[0]).to.contain('failed to read');
  });

  it('should handle setting an external user id when storage is failing', () => {
    const manager = new EmbraceUserManager({
      diag,
      storage: new NamespacedStorage({ storage: new FailingStorage(), diag }),
    });
    diag.clear();

    expect(() => {
      manager.setUserId('my-id');
    }).not.to.throw();

    // The wrapper already flipped disabled during the construction-time write,
    // so subsequent writes are silent.
    expect(diag.getWarnLogs()).to.have.lengthOf(0);
    expect(diag.getErrorLogs()).to.have.lengthOf(0);
  });

  it('should handle clearing an external user id when storage is failing', () => {
    const manager = new EmbraceUserManager({
      diag,
      storage: new NamespacedStorage({ storage: new FailingStorage(), diag }),
    });
    diag.clear();

    expect(() => {
      manager.clearUserId();
    }).not.to.throw();

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.have.lengthOf(1);
    expect(warningLogs[0]).to.contain('failed to remove');
  });
});
