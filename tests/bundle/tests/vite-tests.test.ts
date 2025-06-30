import test from 'node:test';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processSondaReport } from '../utils/index.js';
import assert from 'node:assert';
import { TOTAL_GZIP_SIZE_THRESHOLD_IN_KB } from '../config';
import { resultsToMarkdownTable } from '../../utils/index.js';
import fs from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);

const APP_DIR = resolve(__dirname, '../app');
// To add more targets, add them to the TARGETS array below.
// Also create a vite-config file for each target in the app directory.
// Then add the corresponding build script in package.json, e.g.: build:esnext, build:es2015, etc.
const TARGETS = ['esnext', 'es2015'];

await test.describe('Vite Bundle Tests', async () => {
  const results: Record<
    string,
    Awaited<ReturnType<typeof processSondaReport>>
  > = {};

  test.before(async () => {
    await execAsync('npm run build:clean', {
      cwd: APP_DIR,
    });
  });

  for (const target of TARGETS) {
    await test.it(`should run build:${target} without errors`, async () => {
      const sondaReportPath = resolve(
        __dirname,
        `../app/.sonda/${target}/sonda_0.json`
      );

      const { stderr } = await execAsync(`npm run build:${target}`, {
        cwd: APP_DIR,
      });

      assert.equal(
        stderr,
        '',
        `Build for ${target} should not produce any errors`
      );

      const report = await processSondaReport(sondaReportPath);

      assert.ok(
        report.totalGzipSize < TOTAL_GZIP_SIZE_THRESHOLD_IN_KB,
        `Gzip size of ${report.totalUncompressedSize.toString(2)} KB for ${target} exceeds threshold of ${TOTAL_GZIP_SIZE_THRESHOLD_IN_KB.toFixed(2)} KB`
      );

      results[target] = report;
    });
  }

  test.after(() => {
    const tabledResults = Object.entries(results).reduce(
      (acc, [target, report]) => {
        acc[target] = [
          {
            name: 'Total Uncompressed Size',
            value: report.totalUncompressedSize,
            unit: 'KB',
          },
          {
            name: 'Total Gzip Size',
            value: report.totalGzipSize,
            unit: 'KB',
          },
        ];

        return acc;
      },
      {} as Record<string, { name: string; value: number; unit: string }[]>
    );

    fs.writeFileSync(
      './test-results/vite-tests.md',
      resultsToMarkdownTable(tabledResults)
    );
  });
});
