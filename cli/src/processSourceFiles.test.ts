import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

// Import the function we're testing
import { findJSFilesRecursively } from './processSourceFiles.js';

describe('processSourceFiles - Security Tests', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'embrace-cli-test-'));
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Path Traversal Protection', () => {
    it('should reject source maps with path traversal attempts using ../', () => {
      const jsFile = path.join(testDir, 'malicious.js');
      const jsContent = `
console.log('test');
//# sourceMappingURL=../../etc/passwd
`;
      fs.writeFileSync(jsFile, jsContent);

      const results = findJSFilesRecursively(testDir);

      // Should not include the malicious file
      assert.strictEqual(
        results.length,
        0,
        'Should reject files with path traversal attempts',
      );
    });

    it('should reject source maps pointing outside the directory', () => {
      const jsFile = path.join(testDir, 'external.js');
      const jsContent = `
console.log('test');
//# sourceMappingURL=/tmp/external.js.map
`;
      fs.writeFileSync(jsFile, jsContent);

      const results = findJSFilesRecursively(testDir);

      assert.strictEqual(
        results.length,
        0,
        'Should reject files with absolute paths outside directory',
      );
    });

    it('should accept source maps in the same directory', () => {
      const jsFile = path.join(testDir, 'valid.js');
      const mapFile = path.join(testDir, 'valid.js.map');
      const jsContent = `
console.log('test');
//# sourceMappingURL=valid.js.map
`;
      const mapContent = JSON.stringify({
        version: 3,
        sources: ['valid.ts'],
        names: [],
        mappings: '',
      });

      fs.writeFileSync(jsFile, jsContent);
      fs.writeFileSync(mapFile, mapContent);

      const results = findJSFilesRecursively(testDir);

      assert.strictEqual(results.length, 1, 'Should accept valid source maps');
      // Use realpathSync to normalize paths for comparison (handles /private prefix on macOS)
      assert.strictEqual(
        fs.realpathSync(results[0].jsFilePath),
        fs.realpathSync(jsFile),
      );
      assert.strictEqual(
        fs.realpathSync(results[0].mapFilePath),
        fs.realpathSync(mapFile),
      );
    });
  });

  describe('Missing Source Map Handling', () => {
    it('should skip files without sourceMappingURL comment', () => {
      const jsFile = path.join(testDir, 'no-map-comment.js');
      const jsContent = `
console.log('no source map here');
`;
      fs.writeFileSync(jsFile, jsContent);

      const results = findJSFilesRecursively(testDir);

      assert.strictEqual(
        results.length,
        0,
        'Should skip files without sourceMappingURL',
      );
    });

    it('should skip files where source map file does not exist', () => {
      const jsFile = path.join(testDir, 'missing-map.js');
      const jsContent = `
console.log('test');
//# sourceMappingURL=missing.js.map
`;
      fs.writeFileSync(jsFile, jsContent);
      // Intentionally not creating the .map file

      const results = findJSFilesRecursively(testDir);

      assert.strictEqual(
        results.length,
        0,
        'Should skip files when source map does not exist',
      );
    });

    it('should handle malformed sourceMappingURL comment', () => {
      const jsFile = path.join(testDir, 'malformed.js');
      const jsContent = `
console.log('test');
//# sourceMappingURL=
`;
      fs.writeFileSync(jsFile, jsContent);

      const results = findJSFilesRecursively(testDir);

      assert.strictEqual(
        results.length,
        0,
        'Should handle empty sourceMappingURL',
      );
    });

    it('should support @sourceMappingURL syntax', () => {
      const jsFile = path.join(testDir, 'legacy-syntax.js');
      const mapFile = path.join(testDir, 'legacy-syntax.js.map');
      const jsContent = `
console.log('test');
//@ sourceMappingURL=legacy-syntax.js.map
`;
      const mapContent = JSON.stringify({
        version: 3,
        sources: ['legacy-syntax.ts'],
        names: [],
        mappings: '',
      });

      fs.writeFileSync(jsFile, jsContent);
      fs.writeFileSync(mapFile, mapContent);

      const results = findJSFilesRecursively(testDir);

      assert.strictEqual(results.length, 1, 'Should support legacy @ syntax');
    });
  });

  describe('Subdirectory Handling', () => {
    it('should handle source maps in subdirectories', () => {
      const subDir = path.join(testDir, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });

      const jsFile = path.join(subDir, 'nested.js');
      const mapFile = path.join(subDir, 'nested.js.map');
      const jsContent = `
console.log('nested');
//# sourceMappingURL=nested.js.map
`;
      const mapContent = JSON.stringify({
        version: 3,
        sources: ['nested.ts'],
        names: [],
        mappings: '',
      });

      fs.writeFileSync(jsFile, jsContent);
      fs.writeFileSync(mapFile, mapContent);

      const results = findJSFilesRecursively(testDir);

      assert.strictEqual(
        results.length,
        1,
        'Should find source maps in subdirectories',
      );
      assert.strictEqual(
        fs.realpathSync(results[0].jsFilePath),
        fs.realpathSync(jsFile),
      );
    });

    it('should reject relative paths that escape subdirectory', () => {
      const subDir = path.join(testDir, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });

      const jsFile = path.join(subDir, 'escape.js');
      const jsContent = `
console.log('escape attempt');
//# sourceMappingURL=../escape.js.map
`;
      fs.writeFileSync(jsFile, jsContent);

      const results = findJSFilesRecursively(subDir);

      assert.strictEqual(
        results.length,
        0,
        'Should reject paths that escape the subdirectory',
      );
    });
  });
});
