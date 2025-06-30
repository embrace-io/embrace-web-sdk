import test from 'node:test';
import { processSondaReport } from './index';
import assert from 'node:assert';
import { dirname, resolve } from 'node:path';
import { TOTAL_GZIP_SIZE_THRESHOLD_IN_KB } from '../config';
import fs from 'node:fs';
import { resultsToMarkdownTable } from '../../utils';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);

type RunBundlerBuildSmokeTestOptions = {
  targets: string[];
  bundlerName: string;
  includeBundleSizeTest?: boolean;
  // These are useful to perform more tests for each target, or to log the results
  onSuccess?: (target: string, stdout: string) => void;
  onError?: (target: string, stderr: string) => void;
};

/**
 * Runs a smoke test for the bundler build process.
 * It checks if the build for each target runs without errors and optionally checks the bundle size.
 *
 * It requires the bundler app to have a `build:clean` script to clean the build directory before running the tests.
 * For each target, it runs the `build:<target>` script and checks the output.
 *
 * If `includeBundleSizeTest` is true, it processes the Sonda report to check the total gzip size against a threshold,
 * producing a markdown report with the results in `./test-results/<bundlerName>-tests.md`.
 * Sonda output is expected to be in the `.sonda/<target>/sonda_0.json` file in the app directory.
 */
const runBundlerBuildSmokeTest = async (
  bundlerAppPath: string,
  {
    targets,
    onSuccess,
    onError,
    includeBundleSizeTest = true,
    bundlerName = bundlerAppPath,
  }: RunBundlerBuildSmokeTestOptions
) => {
  const appDir = resolve(__dirname, bundlerAppPath);

  await test.describe(`${bundlerName} Bundle Tests`, async () => {
    const results: Record<
      string,
      Awaited<ReturnType<typeof processSondaReport>>
    > = {};

    test.before(async () => {
      await execAsync('npm run build:clean', {
        cwd: appDir,
      });
    });

    for (const target of targets) {
      await test.it(`should run build:${target} without errors`, async () => {
        const { stdout, stderr } = await execAsync(`npm run build:${target}`, {
          cwd: appDir,
        });

        if (stderr) {
          onError?.(target, stderr);
        }

        assert.equal(
          stderr,
          '',
          `Build for ${target} should not produce any errors`
        );

        onSuccess?.(target, stdout);

        if (!includeBundleSizeTest) {
          return;
        }

        const sondaReportPath = resolve(
          appDir,
          `.sonda/${target}/sonda_0.json`
        );
        const report = await processSondaReport(sondaReportPath);

        assert.ok(
          report.totalGzipSize < TOTAL_GZIP_SIZE_THRESHOLD_IN_KB,
          `Gzip size of ${report.totalGzipSize.toFixed(2)} KB for ${target} exceeds threshold of ${TOTAL_GZIP_SIZE_THRESHOLD_IN_KB.toFixed(2)} KB`
        );

        results[target] = report;
      });
    }

    test.after(() => {
      if (!includeBundleSizeTest) {
        return;
      }

      const tabledResults = Object.entries(results).reduce(
        (acc, [target, report]) => {
          acc[`${bundlerName} - ${target}`] = [
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
        `./test-results/${bundlerName}-tests.md`,
        `### ${bundlerName} Bundle Tests \n\n${resultsToMarkdownTable(tabledResults)}`
      );
    });
  });
};

export { runBundlerBuildSmokeTest };
