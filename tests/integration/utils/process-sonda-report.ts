import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Example Embrace file resource
// {
//   "kind": "filesystem",
//   "name": "../../../../build/esm/api-logs/api/LogAPI/LogAPI.js",
//   "type": "script",
//   "format": "esm",
//   "uncompressed": 863
// },

// Example node_modules resource
// {
//   "kind": "chunk",
//   "name": "../../../../node_modules/@opentelemetry/api-logs/build/esm/ProxyLogger.js",
//   "type": "script",
//   "format": "esm",
//   "uncompressed": 358,
//   "gzip": 139,
//   "brotli": 0,
//   "parent": "dist/assets/index-VIazccMm.js"
// },
type SondaResource = {
  kind: 'filesystem' | 'chunk';
  name: string;
  type: 'image' | 'script';
  uncompressed: number;
  gzip: number;
};

type SondaReport = {
  metadata: {
    gzip: boolean;
    brotli: boolean;
  };
  resources: SondaResource[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const EMBRACE_SDK_PATH_REGEX = new RegExp(
  '^\\.\\./\\.\\./\\.\\./\\.\\./(?!\\.\\.\\.)(.+)$'
);

/**
 * Processes a Sonda report to calculate the total uncompressed and gzip sizes of resources in kb.
 */
const processSondaReport = (sondaReportPath: string) => {
  const reportPath = resolve(__dirname, sondaReportPath);
  const raw = readFileSync(reportPath, 'utf-8');
  const sondaReport: SondaReport = JSON.parse(raw) as SondaReport;

  let totalUncompressedSize = 0;
  let totalGzipSize = 0;

  for (const resource of sondaReport.resources) {
    // ../../../../ represents the relative path to the root of the project where embrace-web-sdk is installed from in the sample app
    if (
      resource.kind !== 'chunk' ||
      !resource.name.match(EMBRACE_SDK_PATH_REGEX)
    ) {
      continue;
    }

    totalUncompressedSize += resource.uncompressed || 0;
    totalGzipSize += resource.gzip || 0;
  }

  return {
    totalUncompressedSize: totalUncompressedSize / 1024, // Convert to KB
    totalGzipSize: totalGzipSize / 1024, // Convert to KB
  };
};

export default processSondaReport;
