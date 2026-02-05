import { readFile } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
// Easier to parse incoming requests with a known type, only used for tests
import type { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types.js';
import type { ReceivedSpans } from '../tests/integration/types.ts';
import { logInfo, logReceivedSessionSpan } from './utils.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
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

  if (req.method === 'GET' && req.url === '/health-check') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');

    return;
  }

  if (req.url === '/received-spans') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(receivedSpans));

    return;
  }

  if (req.url?.includes('logs')) {
    res.writeHead(200);
    res.end('OK');

    return;
  }

  if (req.url?.includes('spans')) {
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
        return;
      });
  }

  // Serve favicon.ico from server/public/ for Vite/webpack platforms
  if (req.url === '/favicon.ico') {
    const filePath = join(__dirname, 'public', 'favicon.ico');

    readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'image/x-icon' });
      res.end(data);
    });

    return;
  }

  // Serve platform test builds: /platforms/{name}/{target}/ → platforms/{name}/dist/{target}/
  if (req.url?.startsWith('/platforms/')) {
    const url = new URL(
      `http://${process.env['HOST'] ?? 'localhost'}${req.url ?? '/'}`,
    );
    // Transform /platforms/vite-7/esnext/index.html → platforms/vite-7/dist/esnext/index.html
    const pathParts = url.pathname.replace('/platforms/', '').split('/');
    const platformName = pathParts[0];
    const rest = pathParts.slice(1).join('/');
    const filePath = join(platformsDir, platformName, 'dist', rest);

    readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }

      const ext = extname(filePath);
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  // Serve static test files from server/public/
  if (req.url?.startsWith('/public/')) {
    const url = new URL(
      `http://${process.env['HOST'] ?? 'localhost'}${req.url ?? '/'}`,
    );
    const filePath = join(__dirname, url.pathname);

    readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }

      const ext = extname(filePath);
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  if (req.url?.startsWith('/dist/')) {
    const url = new URL(
      `http://${process.env['HOST'] ?? 'localhost'}${req.url ?? '/'}`,
    );
    const filePath = join(distDir, url.pathname.replace('/dist/', ''));

    readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }

      const ext = extname(filePath);
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }
});

server.listen(PORT, () => {
  logInfo(`Server is running on http://localhost:${PORT.toString()}`);
});
