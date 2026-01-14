import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

// Import the function we're testing
import {
  findJSFilesRecursively,
  injectBundleIDToSourceFile,
  isAlreadyInjected,
} from './processSourceFiles.ts';

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
    it('should throw error when source map exists outside directory via path traversal', () => {
      // Create a parent directory with a map file
      const parentDir = path.dirname(testDir);
      const maliciousMapFile = path.join(parentDir, 'malicious.js.map');
      const mapContent = JSON.stringify({
        version: 3,
        sources: ['malicious.ts'],
        names: [],
        mappings: '',
      });
      fs.writeFileSync(maliciousMapFile, mapContent);

      try {
        const jsFile = path.join(testDir, 'malicious.js');
        const jsContent = `
console.log('test');
//# sourceMappingURL=../malicious.js.map
`;
        fs.writeFileSync(jsFile, jsContent);

        // This should throw an error
        assert.throws(
          () => findJSFilesRecursively(testDir),
          /Source map.*resolves outside the search directory/,
          'Should throw security error for path traversal',
        );
      } finally {
        // Clean up the malicious map file
        if (fs.existsSync(maliciousMapFile)) {
          fs.unlinkSync(maliciousMapFile);
        }
      }
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

    it('should throw error when relative path escapes subdirectory to existing file', () => {
      const subDir = path.join(testDir, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });

      // Create a map file in the parent directory
      const escapeMapFile = path.join(testDir, 'escape.js.map');
      const mapContent = JSON.stringify({
        version: 3,
        sources: ['escape.ts'],
        names: [],
        mappings: '',
      });
      fs.writeFileSync(escapeMapFile, mapContent);

      const jsFile = path.join(subDir, 'escape.js');
      const jsContent = `
console.log('escape attempt');
//# sourceMappingURL=../escape.js.map
`;
      fs.writeFileSync(jsFile, jsContent);

      assert.throws(
        () => findJSFilesRecursively(subDir),
        /Source map.*resolves outside the search directory/,
        'Should throw security error when escaping subdirectory',
      );
    });

    it('should accept relative path within subdirectory', () => {
      const subDir = path.join(testDir, 'subdir');
      const nestedDir = path.join(subDir, 'nested');
      fs.mkdirSync(nestedDir, { recursive: true });

      const jsFile = path.join(nestedDir, 'file.js');
      const mapFile = path.join(subDir, 'file.js.map');
      const jsContent = `
console.log('nested with relative path');
//# sourceMappingURL=../file.js.map
`;
      const mapContent = JSON.stringify({
        version: 3,
        sources: ['file.ts'],
        names: [],
        mappings: '',
      });

      fs.writeFileSync(jsFile, jsContent);
      fs.writeFileSync(mapFile, mapContent);

      const results = findJSFilesRecursively(testDir);

      assert.strictEqual(
        results.length,
        1,
        'Should accept relative paths that stay within the search tree',
      );
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

  describe('Fallback Behavior', () => {
    it('should use fallback .js.map when no sourceMappingURL comment exists', () => {
      const jsFile = path.join(testDir, 'fallback.js');
      const mapFile = path.join(testDir, 'fallback.js.map');
      const jsContent = `console.log('no comment here');`;
      const mapContent = JSON.stringify({
        version: 3,
        sources: ['fallback.ts'],
        names: [],
        mappings: '',
      });

      fs.writeFileSync(jsFile, jsContent);
      fs.writeFileSync(mapFile, mapContent);

      const results = findJSFilesRecursively(testDir);

      assert.strictEqual(results.length, 1, 'Should use fallback .js.map file');
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

  describe('Error Handling', () => {
    it('should handle multiple files with mixed valid and invalid maps', () => {
      // Create valid file
      const validJs = path.join(testDir, 'valid.js');
      const validMap = path.join(testDir, 'valid.js.map');
      fs.writeFileSync(
        validJs,
        'console.log("valid");\n//# sourceMappingURL=valid.js.map',
      );
      fs.writeFileSync(
        validMap,
        JSON.stringify({
          version: 3,
          sources: ['valid.ts'],
          names: [],
          mappings: '',
        }),
      );

      // Create file with missing map
      const missingJs = path.join(testDir, 'missing.js');
      fs.writeFileSync(
        missingJs,
        'console.log("missing");\n//# sourceMappingURL=missing.js.map',
      );

      // Create file with no comment and no fallback
      const noMapJs = path.join(testDir, 'nomap.js');
      fs.writeFileSync(noMapJs, 'console.log("nomap");');

      const results = findJSFilesRecursively(testDir);

      // Should only include the valid file
      assert.strictEqual(results.length, 1, 'Should only include valid files');
      assert.strictEqual(
        fs.realpathSync(results[0].jsFilePath),
        fs.realpathSync(validJs),
      );
    });

    it('should stop processing on first security violation', () => {
      // Create valid file first
      const validJs = path.join(testDir, 'aaa-valid.js');
      const validMap = path.join(testDir, 'aaa-valid.js.map');
      fs.writeFileSync(
        validJs,
        'console.log("valid");\n//# sourceMappingURL=aaa-valid.js.map',
      );
      fs.writeFileSync(
        validMap,
        JSON.stringify({
          version: 3,
          sources: ['valid.ts'],
          names: [],
          mappings: '',
        }),
      );

      // Create malicious file that will be processed after (alphabetically)
      const maliciousMapFile = path.join(
        path.dirname(testDir),
        'zzz-malicious.js.map',
      );
      fs.writeFileSync(
        maliciousMapFile,
        JSON.stringify({
          version: 3,
          sources: ['malicious.ts'],
          names: [],
          mappings: '',
        }),
      );

      try {
        const maliciousJs = path.join(testDir, 'zzz-malicious.js');
        fs.writeFileSync(
          maliciousJs,
          'console.log("bad");\n//# sourceMappingURL=../zzz-malicious.js.map',
        );

        assert.throws(
          () => findJSFilesRecursively(testDir),
          /Source map.*resolves outside/,
          'Should throw on security violation even with valid files present',
        );
      } finally {
        if (fs.existsSync(maliciousMapFile)) {
          fs.unlinkSync(maliciousMapFile);
        }
      }
    });
  });
});

describe('processSourceFiles - Injection Detection', () => {
  describe('isAlreadyInjected', () => {
    it('should return false for files without injection marker', () => {
      const jsContent = `console.log('test');
//# sourceMappingURL=test.js.map`;

      assert.strictEqual(
        isAlreadyInjected(jsContent),
        false,
        'Should return false for unprocessed files',
      );
    });

    it('should return true for files with injection marker', () => {
      const jsContent = `console.log('test');
// Injected by Embrace Web CLI:
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},l=(new e.Error).stack;l&&(e._EmbraceFileBundleIDs=e._EmbraceFileBundleIDs||{},e._EmbraceFileBundleIDs[l]="abc123")}catch(e){}}();
//# sourceMappingURL=test.js.map`;

      assert.strictEqual(
        isAlreadyInjected(jsContent),
        true,
        'Should return true for already processed files',
      );
    });

    it('should detect injection marker anywhere in the file', () => {
      const jsContent = `// Injected by Embrace Web CLI:
!function(){try{var e="undefined"!=typeof window?window}catch(e){}}();
console.log('test');
//# sourceMappingURL=test.js.map`;

      assert.strictEqual(
        isAlreadyInjected(jsContent),
        true,
        'Should detect marker regardless of position',
      );
    });
  });

  describe('injectBundleIDToSourceFile', () => {
    it('should inject snippet before sourceMappingURL comment', () => {
      const jsContent = `console.log('test');
//# sourceMappingURL=test.js.map`;
      const bundleID = 'abc123def456';

      const result = injectBundleIDToSourceFile(jsContent, bundleID);

      assert.ok(
        result.includes('// Injected by Embrace Web CLI:'),
        'Should include injection marker',
      );
      assert.ok(
        result.includes(bundleID),
        'Should include the bundle ID in the snippet',
      );

      const lines = result.split('\n');
      const markerIndex = lines.findIndex((l) =>
        l.includes('// Injected by Embrace Web CLI:'),
      );
      const sourceMapIndex = lines.findIndex((l) =>
        l.includes('//# sourceMappingURL='),
      );
      assert.ok(
        markerIndex < sourceMapIndex,
        'Injection should be before sourceMappingURL',
      );
    });

    it('should inject at end if no sourceMappingURL comment exists', () => {
      const jsContent = `console.log('test');`;
      const bundleID = 'abc123def456';

      const result = injectBundleIDToSourceFile(jsContent, bundleID);

      assert.ok(
        result.includes('// Injected by Embrace Web CLI:'),
        'Should include injection marker',
      );
      assert.ok(result.includes(bundleID), 'Should include the bundle ID');
    });

    it('should produce content detectable by isAlreadyInjected', () => {
      const jsContent = `console.log('test');
//# sourceMappingURL=test.js.map`;
      const bundleID = 'abc123def456';

      const injectedContent = injectBundleIDToSourceFile(jsContent, bundleID);

      assert.strictEqual(
        isAlreadyInjected(jsContent),
        false,
        'Original content should not be detected as injected',
      );
      assert.strictEqual(
        isAlreadyInjected(injectedContent),
        true,
        'Injected content should be detected as already injected',
      );
    });
  });
});
