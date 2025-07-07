import { createServer } from 'http';
import zlib from 'node:zlib';
import { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types';
import { type ReceivedSpans } from '../types.js';
import { IncomingMessage } from 'node:http';
import { extname, join } from 'path';
import { readFile } from 'fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = 3001;

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};

const receivedSpans: ReceivedSpans = {};

const parseGzip = async (req: IncomingMessage): Promise<Object> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      zlib.gunzip(buffer, (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          try {
            resolve(JSON.parse(decoded.toString('utf-8')));
          } catch (parseError) {
            reject(parseError);
          }
        }
      });
    });
  });
};

const server = createServer(async (req, res) => {
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

  if (req.url == '/received-spans') {
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
    const request: IExportTraceServiceRequest = await parseGzip(req);

    const sessionSpan =
      request.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.find(
        span => span.name === 'emb-session'
      );
    const sessionId = sessionSpan?.attributes?.find(
      attr => attr.key === 'session.id'
    )?.value.stringValue;

    if (!sessionId) {
      res.writeHead(400);
      res.end('Session ID not found');
      return;
    }

    receivedSpans[sessionId] = true;
    console.log('Stored a new session ID:', sessionId);

    res.writeHead(200);
    res.end('OK');

    return;
  }

  if (req.url?.includes('public')) {
    const url = new URL(
      `http://${process.env.HOST ?? 'localhost'}${req.url ?? '/'}`
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
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT.toString()}`);
});
