import { readFile } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
// Easier to parse incoming requests with a known type, only used for tests
import type { IExportLogsServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/logs/internal-types.js';
import type { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types.js';
import type { ReceivedSpans } from '../tests/integration/types.ts';
import {
  logInfo,
  logReceivedLogRecords,
  logReceivedSessionPartSpan,
  logReceivedSpans,
  logWarn,
} from './utils.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sdkDistDir = join(__dirname, '..', 'packages', 'web-sdk', 'dist');
const platformsDir = join(__dirname, '..', 'tests', 'integration', 'platforms');

const PORT = 3001;

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const receivedSpans: ReceivedSpans = {};

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

const parseGzip = async (
  req: IncomingMessage,
): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('error', reject);
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      zlib.gunzip(buffer, (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          try {
            resolve(
              JSON.parse(decoded.toString('utf-8')) as Record<string, unknown>,
            );
          } catch (parseError) {
            reject(parseError as Error);
          }
        }
      });
    });
  });

const server = createServer((req, res) => {
  // allow cors
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();

    return;
  }

  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

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

  if (pathname?.includes('logs')) {
    parseGzip(req)
      .then((request: IExportLogsServiceRequest) => {
        const logRecords =
          request.resourceLogs?.flatMap(
            (r) => r.scopeLogs?.flatMap((s) => s.logRecords ?? []) ?? [],
          ) ?? [];

        logReceivedLogRecords(logRecords);

        res.writeHead(200);
        res.end('OK');
      })
      .catch((e: unknown) => {
        console.error('Error handling log request:', e);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      });
    return;
  }

  if (pathname?.includes('spans')) {
    parseGzip(req)
      .then((request: IExportTraceServiceRequest) => {
        const resourceSpans = request.resourceSpans ?? [];

        logReceivedSpans(resourceSpans);

        const sessionPartSpan =
          resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.find(
            (span) => span.name === 'emb-session-part',
          );
        const userSessionId = sessionPartSpan?.attributes.find(
          (attr) => attr.key === 'emb.user_session_id',
        )?.value.stringValue;

        if (sessionPartSpan && !userSessionId) {
          logWarn(
            'emb-session-part received without emb.user_session_id; SDK contract broken?',
          );
        }

        if (userSessionId) {
          receivedSpans[userSessionId] =
            (receivedSpans[userSessionId] ?? 0) + 1;
          if (sessionPartSpan) {
            logReceivedSessionPartSpan(
              resourceSpans,
              sessionPartSpan,
              userSessionId,
            );
          }
        }

        res.writeHead(200);
        res.end('OK');
      })
      .catch((e: unknown) => {
        console.error('Error parsing gzip request:', e);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
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
});

server.listen(PORT, () => {
  logInfo(`Debug collector running on http://localhost:${PORT}`);
  logInfo('To send telemetry to the debug collector, add your');
  logInfo(`appID to ./demo/frontend/.env:`);
  logInfo(`  VITE_APP_ID=your-app-id`);
  logInfo(`  VITE_DATA_URL=http://localhost:${PORT}`);
  logInfo(`  VITE_CONFIG_URL=http://localhost:${PORT}`);
});
