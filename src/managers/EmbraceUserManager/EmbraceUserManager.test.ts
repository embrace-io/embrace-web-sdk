import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { KEY_ENDUSER_PSEUDO_ID } from '../../api-users/index.ts';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../testUtils/index.ts';
import {
  EMBRACE_EXTERNAL_USER_ID_KEY,
  EMBRACE_USER_ID_STORAGE_KEY,
  EMBRACE_USER_STORAGE_KEY_DEPRECATED,
} from './constants.ts';
import { EmbraceUserManager } from './EmbraceUserManager.ts';

chai.use(sinonChai);
const { expect } = chai;

const VALID_UUID = 'aaaaBBBBccccDDDDeeeeFFFFggggHHHH';

describe('EmbraceUserManager', () => {
  let storage: InMemoryStorage;
  let diag: InMemoryDiagLogger;

  beforeEach(() => {
    storage = new InMemoryStorage();
    diag = new InMemoryDiagLogger();
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

  it('should handle being setup with a non-functional storage', () => {
    // @ts-expect-error dealing with potential restricted browser environments where storage APIs are unavailable
    const manager = new EmbraceUserManager({ diag, storage: null });
    expect(manager.getEmbraceUserId()).to.have.lengthOf(32);
    manager.clearEmbraceUserId();
    expect(diag.getWarnLogs()).to.have.lengthOf(4);
    expect(diag.getWarnLogs()).to.deep.equal([
      'Failed to get old user data from storage',
      'Failed to get embrace user id from storage, defaulting to a new one',
      'Failed to persist user object for storage, keeping it in-memory only',
      'Failed to remove embrace user in storage',
    ]);
  });

  it('should handle its storage throwing errors', () => {
    const manager = new EmbraceUserManager({
      diag,
      storage: new FailingStorage(),
    });
    expect(manager.getEmbraceUserId()).to.have.lengthOf(32);
    manager.clearEmbraceUserId();
    expect(diag.getWarnLogs()).to.have.lengthOf(4);
    expect(diag.getWarnLogs()).to.deep.equal([
      'Failed to get old user data from storage',
      'Failed to get embrace user id from storage, defaulting to a new one',
      'Failed to persist user object for storage, keeping it in-memory only',
      'Failed to remove embrace user in storage',
    ]);
  });

  it('should migrate old local storage key', () => {
    storage.setItem(
      EMBRACE_USER_STORAGE_KEY_DEPRECATED,
      JSON.stringify({ [KEY_ENDUSER_PSEUDO_ID]: VALID_UUID }),
    );

    const manager = new EmbraceUserManager({ diag, storage });
    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal(
      'Migrating old user data from storage',
    );
    expect(manager.getEmbraceUserId()).to.equal(VALID_UUID);
    void expect(storage.getItem(EMBRACE_USER_STORAGE_KEY_DEPRECATED)).to.be
      .null;
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
      storage: new FailingStorage(),
    });
    diag.clear();

    expect(manager.getUserId()).to.equal(null);

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.deep.equal([
      'Failed to retrieve user id from storage',
    ]);
  });

  it('should handle setting an external user id when storage is failing', () => {
    const manager = new EmbraceUserManager({
      diag,
      storage: new FailingStorage(),
    });
    diag.clear();

    expect(() => {
      manager.setUserId('my-id');
    }).not.to.throw();

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.deep.equal(['Failed to store user id']);
  });

  it('should handle clearing an external user id when storage is failing', () => {
    const manager = new EmbraceUserManager({
      diag,
      storage: new FailingStorage(),
    });
    diag.clear();

    expect(() => {
      manager.clearUserId();
    }).not.to.throw();

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.deep.equal(['Failed to clear user id']);
  });
});
