import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { validateInput } from './validateInput.ts';

describe('validateInput', () => {
  let testDir: string;

  const validInput = () => ({
    buildPath: testDir,
    token: 'a'.repeat(32),
    appID: 'abc12',
    host: 'example.com',
    pathForUpload: '/upload',
    storeType: 'store',
    appVersion: '1.0.0',
    cliVersion: '1.0.0',
    templateAppVersion: 'EmbIOAppVersionX.X.X',
    upload: true,
  });

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'embrace-cli-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should pass with valid input', () => {
    const result = validateInput(validInput());
    assert.strictEqual(result, null);
  });

  describe('buildPath', () => {
    it('should reject empty buildPath', () => {
      const result = validateInput({ ...validInput(), buildPath: '' });
      assert.strictEqual(result, 'buildPath cannot be empty.');
    });

    it('should reject whitespace-only buildPath', () => {
      const result = validateInput({ ...validInput(), buildPath: '   ' });
      assert.strictEqual(result, 'buildPath cannot be empty.');
    });

    it('should reject non-existent buildPath', () => {
      const result = validateInput({
        ...validInput(),
        buildPath: '/non/existent/path',
      });
      assert.strictEqual(result, 'buildPath not found.');
    });

    it('should reject buildPath that is a file', () => {
      const filePath = path.join(testDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');
      const result = validateInput({ ...validInput(), buildPath: filePath });
      assert.strictEqual(result, 'buildPath needs to be a valid directory.');
    });
  });

  describe('appVersion', () => {
    it('should accept undefined appVersion', () => {
      const { appVersion: _, ...inputWithoutAppVersion } = validInput();
      const result = validateInput(inputWithoutAppVersion);
      assert.strictEqual(result, null);
    });

    it('should reject empty string appVersion', () => {
      const result = validateInput({ ...validInput(), appVersion: '' });
      assert.strictEqual(result, 'appVersion cannot be an empty string.');
    });

    it('should reject whitespace-only appVersion', () => {
      const result = validateInput({ ...validInput(), appVersion: '   ' });
      assert.strictEqual(result, 'appVersion cannot be an empty string.');
    });

    it('should reject appVersion longer than 20 characters', () => {
      const result = validateInput({
        ...validInput(),
        appVersion: 'a'.repeat(21),
      });
      assert.strictEqual(
        result,
        'appVersion cannot be longer than 20 characters.',
      );
    });

    it('should accept appVersion of exactly 20 characters', () => {
      const result = validateInput({
        ...validInput(),
        appVersion: 'a'.repeat(20),
      });
      assert.strictEqual(result, null);
    });
  });

  describe('token', () => {
    it('should reject empty token when upload is true', () => {
      const result = validateInput({ ...validInput(), token: '' });
      assert.strictEqual(result, 'Token cannot be empty.');
    });

    it('should reject token not 32 characters when upload is true', () => {
      const result = validateInput({ ...validInput(), token: 'short' });
      assert.strictEqual(result, 'Token must be 32 characters long.');
    });

    it('should allow any token when upload is false', () => {
      const result = validateInput({
        ...validInput(),
        upload: false,
        token: '',
      });
      assert.strictEqual(result, null);
    });
  });

  describe('appID', () => {
    it('should reject empty appID', () => {
      const result = validateInput({ ...validInput(), appID: '' });
      assert.strictEqual(result, 'App ID cannot be empty.');
    });

    it('should reject appID not 5 characters', () => {
      const result = validateInput({ ...validInput(), appID: 'abc' });
      assert.strictEqual(result, 'App ID must be 5 characters long.');
    });
  });

  describe('host', () => {
    it('should reject empty host', () => {
      const result = validateInput({ ...validInput(), host: '' });
      assert.strictEqual(result, 'Host cannot be empty.');
    });
  });

  describe('pathForUpload', () => {
    it('should reject empty pathForUpload', () => {
      const result = validateInput({ ...validInput(), pathForUpload: '' });
      assert.strictEqual(result, 'Path cannot be empty.');
    });
  });

  describe('storeType', () => {
    it('should reject empty storeType', () => {
      const result = validateInput({ ...validInput(), storeType: '' });
      assert.strictEqual(result, 'Store type cannot be empty.');
    });
  });

  describe('cliVersion', () => {
    it('should reject empty cliVersion', () => {
      const result = validateInput({ ...validInput(), cliVersion: '' });
      assert.strictEqual(result, 'CLI version cannot be empty.');
    });
  });

  describe('templateAppVersion', () => {
    it('should reject empty templateAppVersion', () => {
      const result = validateInput({ ...validInput(), templateAppVersion: '' });
      assert.strictEqual(result, 'Template App version cannot be empty.');
    });

    it('should reject templateAppVersion not 20 characters', () => {
      const result = validateInput({
        ...validInput(),
        templateAppVersion: 'short',
      });
      assert.strictEqual(
        result,
        'Template App version must be 20 characters long.',
      );
    });
  });
});
