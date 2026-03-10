import { readFile } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
// Easier to parse incoming requests with a known type, only used for tests
import type { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types.js';
import type { ReceivedSpans } from '../tests/integration/types.ts';
import { logInfo, logReceivedSessionSpan } from './utils.ts';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    res.writeHead(200);
    res.end('OK');
    return;
  }

  if (pathname?.includes('spans')) {
    parseGzip(req)
      .then((request: IExportTraceServiceRequest) => {
        const sessionSpan =
          request.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.find(
            (span) => span.name === 'emb-session',
          );
        const sessionId = sessionSpan?.attributes.find(
          (attr) => attr.key === 'session.id',
        )?.value.stringValue;

        if (!sessionId) {
          res.writeHead(400);
          res.end('Session ID not found');
          return;
        }

        receivedSpans[sessionId] = true;

        if (request.resourceSpans && sessionSpan) {
          logReceivedSessionSpan(request.resourceSpans, sessionSpan, sessionId);
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
  logInfo('To send telemetry to the debug collector, set:');
  logInfo(`  VITE_DATA_URL=http://localhost:${PORT} in your .env file`);
});
