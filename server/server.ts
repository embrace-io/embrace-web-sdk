import { readFile } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Deep imports: otlp-transformer exports only its response types, not the OTLP/JSON request shapes.
import type { IExportLogsServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/logs/internal-types.js';
import type { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types.js';
import type { ReceivedSpans } from '../tests/integration/types.ts';
import {
  embraceIngestTypeOf,
  formatEmbraceIngestDrop,
  formatEmbraceIngestFailure,
  readEmbraceIngestRequest,
  writeEmbraceIngestAccepted,
  writeEmbraceIngestPreflight,
} from './embrace-ingest.ts';
import {
  otlpSignalOf,
  readOtlpRequest,
  writeOtlpRejection,
  writeOtlpServerError,
  writeOtlpSuccess,
} from './otlp-ingest.ts';
import type { OtlpJson } from './utils.ts';
import {
  logError,
  logInfo,
  logReceivedLogRecords,
  logReceivedMetrics,
  logReceivedSessionPartSpan,
  logReceivedSpans,
  logWarn,
  RequestAbortedError,
} from './utils.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sdkDistDir = join(__dirname, '..', 'packages', 'web-sdk', 'dist');
const platformsDir = join(__dirname, '..', 'tests', 'integration', 'platforms');

const PORT = 3001;

// Opt-in mode for reproducing the keepalive quota leak: a no-store response
// holds keepalive budget until the body is read. Off by default so the normal
// response stays byte-identical to production.
const SIMULATE_NO_STORE = process.env['EMB_NO_STORE'] === '1';

const embraceIngestExtraHeaders = (): Record<string, string> =>
  SIMULATE_NO_STORE ? { 'Cache-Control': 'no-store' } : {};

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const receivedSpans: ReceivedSpans = {};

// Mirrors the production payload, narrowed to the fields this SDK reads. The
// user_session values match the SDK's own defaults, so they change nothing at
// runtime but do exercise parseRemoteConfig's optional branches and the manager's
// clamping, which stay dead when the block is absent. The etag is fixed so a
// reload takes the 304 path.
const REMOTE_CONFIG = {
  threshold: 100,
  user_session: {
    max_duration_seconds: 43200,
    inactivity_timeout_seconds: 1800,
    web_foreground_inactivity_timeout_seconds: 1800,
  },
};
const REMOTE_CONFIG_ETAG = '"local-collector-1"';

function serveFile(res: ServerResponse, filePath: string) {
  readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const contentType =
      mimeTypes[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const recordLogs = (request: OtlpJson<IExportLogsServiceRequest>) => {
  const logRecords =
    request.resourceLogs?.flatMap(
      (r) => r.scopeLogs?.flatMap((s) => s.logRecords ?? []) ?? [],
    ) ?? [];

  logReceivedLogRecords(logRecords);
};

const recordSpans = (request: OtlpJson<IExportTraceServiceRequest>) => {
  const resourceSpans = request.resourceSpans ?? [];

  logReceivedSpans(resourceSpans);

  const sessionPartSpan = resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.find(
    (span) => span.name === 'emb-session-part',
  );
  const stringAttribute = (key: string) =>
    (sessionPartSpan?.attributes ?? []).find((attr) => attr.key === key)?.value
      ?.stringValue ?? undefined;
  const userSessionId = stringAttribute('emb.user_session_id');

  if (sessionPartSpan && !userSessionId) {
    logWarn(
      'emb-session-part received without emb.user_session_id; SDK contract broken?',
    );
  }

  if (userSessionId) {
    if (!receivedSpans[userSessionId]) {
      receivedSpans[userSessionId] = {};
    }
    if (sessionPartSpan) {
      const sessionPartId = stringAttribute('emb.session_part_id');
      const endReason = stringAttribute('emb.session_part_end_reason');
      if (!endReason) {
        logWarn(
          'emb-session-part received without emb.session_part_end_reason; SDK contract broken?',
        );
      }
      if (sessionPartId) {
        receivedSpans[userSessionId][sessionPartId] = { endReason };
      }
      logReceivedSessionPartSpan(resourceSpans, sessionPartSpan, userSessionId);
    }
  }
};

// The Embrace SDK always sends gzipped JSON, so its X-EM-* headers on anything else mean a regression.
const embraceContractViolation = (req: IncomingMessage): string | undefined => {
  if (
    req.headers['x-em-aid'] === undefined &&
    req.headers['x-em-did'] === undefined
  ) {
    return undefined;
  }
  const contentType = req.headers['content-type'] ?? '';
  if (contentType.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return `Embrace request with Content-Type "${contentType}", expected application/json`;
  }
  const contentEncoding = req.headers['content-encoding'] ?? '';
  if (contentEncoding.trim().toLowerCase() !== 'gzip') {
    return `Embrace request with Content-Encoding "${contentEncoding}", expected gzip`;
  }
  return undefined;
};

const server = createServer((req, res) => {
  // The demo and the integration test apps serve from other ports and call this server cross-origin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', '*');
  // ETag is not CORS-safelisted, so without this the demo on another port reads
  // it back as null and never sends If-None-Match.
  res.setHeader('Access-Control-Expose-Headers', 'ETag');

  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const embraceIngestType = embraceIngestTypeOf(pathname);

  if (req.method === 'OPTIONS') {
    if (embraceIngestType) {
      writeEmbraceIngestPreflight(res);
      return;
    }
    res.writeHead(204);
    res.end();

    return;
  }

  // Mirrors production's root response.
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('0\n');
    return;
  }

  if (req.method === 'GET' && pathname === '/health-check') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  if (pathname === '/received-spans') {
    if (req.method === 'DELETE') {
      for (const key of Object.keys(receivedSpans)) {
        delete receivedSpans[key];
      }
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(receivedSpans));
    return;
  }

  if (pathname === '/v2/config') {
    if (req.headers['if-none-match'] === REMOTE_CONFIG_ETAG) {
      res.writeHead(304, { ETag: REMOTE_CONFIG_ETAG });
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      ETag: REMOTE_CONFIG_ETAG,
    });
    res.end(JSON.stringify(REMOTE_CONFIG));
    return;
  }

  const otlpSignal = otlpSignalOf(pathname);
  const isIngest = otlpSignal !== undefined || embraceIngestType !== undefined;
  const violation = isIngest ? embraceContractViolation(req) : undefined;
  if (violation) {
    logWarn(`${violation} on ${pathname}; SDK contract broken?`);
    res.writeHead(415, { 'Content-Type': 'text/plain' });
    res.end(violation);
    return;
  }

  if (otlpSignal && req.method === 'POST') {
    readOtlpRequest(req, otlpSignal)
      .then((result) => {
        if (!result.ok) {
          writeOtlpRejection(res, otlpSignal, result);
          return;
        }
        if (result.signal === 'traces') {
          recordSpans(result.request);
        } else if (result.signal === 'logs') {
          recordLogs(result.request);
        } else {
          logReceivedMetrics(result.request.resourceMetrics ?? []);
        }
        writeOtlpSuccess(res);
      })
      .catch((e: unknown) => {
        if (e instanceof RequestAbortedError) {
          logWarn(`Client aborted OTLP ${otlpSignal} request: ${e.message}`);
          return;
        }
        writeOtlpServerError(res, otlpSignal, e);
      });
    return;
  }

  if (embraceIngestType) {
    readEmbraceIngestRequest(req, embraceIngestType)
      .then((result) => {
        if (!result.ok) {
          logWarn(...formatEmbraceIngestDrop(req, embraceIngestType, result));
        } else if (result.type === 'spans') {
          recordSpans(result.request);
        } else {
          recordLogs(result.request);
        }
        writeEmbraceIngestAccepted(res, embraceIngestExtraHeaders());
      })
      .catch((e: unknown) => {
        if (e instanceof RequestAbortedError) {
          logWarn(
            `Client aborted Embrace ${embraceIngestType} request: ${e.message}`,
          );
          return;
        }
        // Production replies 200 before processing, and a 5xx would make the SDK retry.
        logError(formatEmbraceIngestFailure(req, embraceIngestType), e);
        writeEmbraceIngestAccepted(res, embraceIngestExtraHeaders());
      });
    return;
  }

  if (pathname === '/embrace-web-sdk.js') {
    serveFile(res, join(sdkDistDir, 'embrace-web-sdk.js'));
    return;
  }

  if (pathname === '/favicon.ico') {
    serveFile(res, join(__dirname, 'public', 'favicon.ico'));
    return;
  }

  // /platforms/vite-7/esnext/index.html → platforms/vite-7/dist/esnext/index.html
  if (pathname?.startsWith('/platforms/')) {
    const pathParts = pathname.replace('/platforms/', '').split('/');
    const platformName = pathParts[0];
    const rest = pathParts.slice(1).join('/');
    serveFile(res, join(platformsDir, platformName, 'dist', rest));
    return;
  }

  if (pathname?.startsWith('/public/')) {
    serveFile(res, join(__dirname, pathname));
    return;
  }

  // Production answers unknown paths with 404 "1"; with no reply the request hangs.
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end('1\n');
});

server.listen(PORT, () => {
  logInfo(`Debug collector running on http://localhost:${PORT}`);
  if (SIMULATE_NO_STORE) {
    logWarn(
      'EMB_NO_STORE=1: Embrace ingest responses carry Cache-Control: no-store',
    );
  }
  logInfo('To send telemetry to the debug collector, add your');
  logInfo(`appID to ./demo/frontend/.env:`);
  logInfo(`  VITE_APP_ID=your-app-id`);
  logInfo(`  VITE_DATA_URL=http://localhost:${PORT}`);
  logInfo(`  VITE_CONFIG_URL=http://localhost:${PORT}`);
});
