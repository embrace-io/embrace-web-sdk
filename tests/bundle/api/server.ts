import { createServer } from 'http';
import zlib from 'node:zlib';
import { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types';
import { ReceivedSpans } from '../types.js';

const PORT = 3001;
const receivedSpans: ReceivedSpans = {};

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

  if (req.url == '/received-spans') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(receivedSpans));
    return;
  }

  if (req.url?.includes('spans')) {
    const chunks: Buffer[] = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);

      const handleData = (data: Buffer) => {
        try {
          const json = JSON.parse(data.toString('utf-8'));

          const sessionSpan = (
            json as IExportTraceServiceRequest
          ).resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.find(
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
        } catch (err) {
          res.writeHead(400);
          res.end('Invalid JSON');
        }
      };

      zlib.gunzip(buffer, (err, decoded) => {
        if (err) {
          res.writeHead(400);
          res.end('Failed to decompress');
        } else {
          handleData(decoded);
        }
      });
    });
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT.toString()}`);
});
