import test from 'node:test';
import { processSondaReport } from './index';
import assert from 'node:assert';
import { dirname, resolve } from 'node:path';
import { TOTAL_GZIP_SIZE_THRESHOLD_IN_KB } from '../config';
import fs from 'node:fs';
import { resultsToMarkdownTable } from '../../utils';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);

type RunPlatformBuildSmokeTestOptions = {
  targets: string[];
  platformName: string;
  includePlatformSizeTest?: boolean;
  copyOutputToServer?: boolean;
  // These are useful to perform more tests for each target, or to log the results
  onSuccess?: (target: string, stdout: string) => void;
  onError?: (target: string, stderr: string) => void;
};

/**
 * Runs a smoke test for the platform build process.
 * It checks if the build for each target runs without errors and optionally checks the bundle size.
 *
 * It requires the platform to have a `build:clean` script to clean the build directory before running the tests.
 * For each target, it runs the `build:<target>` script and checks the output.
 *
 * If `includePlatformSizeTest` is true, it processes the Sonda report to check the total gzip size against a threshold,
 * producing a markdown report with the results in `./test-results/<platformName>-tests.md`.
 * Sonda output is expected to be in the `.sonda/<target>/sonda_0.json` file in the app directory.
 *
 * It also copies the build output to server/public directory so we can serve it in other tests.
 * The output of the build must be in the `dist` directory of the platform.
 */
const runPlatformBuildSmokeTest = async (
  platformPath: string,
  {
    targets,
    onSuccess,
    onError,
    includePlatformSizeTest = true,
    copyOutputToServer = true,
    platformName = platformPath,
  }: RunPlatformBuildSmokeTestOptions
) => {
  await test.describe(`${platformName} Platform Tests`, async () => {
    const results: Record<
      string,
      Awaited<ReturnType<typeof processSondaReport>>
    > = {};

    test.before(async () => {
      await execAsync('npm run build:clean', {
        cwd: platformPath,
      });
    });

    for (const target of targets) {
      await test.it(`should run build:${target} without errors`, async () => {
        try {
          const { stdout } = await execAsync(`npm run build:${target}`, {
            cwd: platformPath,
          });

          onSuccess?.(target, stdout);

          if (includePlatformSizeTest) {
            const sondaReportPath = resolve(
              platformPath,
              `.sonda/${target}/sonda_0.json`
            );
            const report = await processSondaReport(sondaReportPath);

            assert.ok(
              report.totalGzipSize < TOTAL_GZIP_SIZE_THRESHOLD_IN_KB,
              `Gzip size of ${report.totalGzipSize.toFixed(2)} KB for ${target} exceeds threshold of ${TOTAL_GZIP_SIZE_THRESHOLD_IN_KB.toFixed(2)} KB`
            );

            results[target] = report;
          }

          if (copyOutputToServer) {
            // Copy the build output to server/public directory
            const buildOutputPath = resolve(platformPath, 'dist');
            const serverPath = resolve(__dirname, '../server/public');
            const publicOutputPath = resolve(
              buildOutputPath,
              serverPath,
              platformName
            );

            fs.mkdirSync(publicOutputPath, { recursive: true });
            fs.cpSync(buildOutputPath, publicOutputPath, {
              recursive: true,
              force: true,
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          onError?.(target, errorMessage);
          assert.fail(`Build for ${target} failed: ${errorMessage}`);
        }
      });
    }

    test.after(() => {
      if (!includePlatformSizeTest) {
        return;
      }

      const tabledResults = Object.entries(results).reduce(
        (acc, [target, report]) => {
          acc[`${platformName} - ${target}`] = [
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

      // Creat folder if it doesn't exist
      const resultsDir = './build-test-results';
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      fs.writeFileSync(
        `./build-test-results/${platformName}-tests.md`,
        `### ${platformName} Platform Tests \n\n${resultsToMarkdownTable(tabledResults)}`
      );
    });
  });
};

export default runPlatformBuildSmokeTest;
