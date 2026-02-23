import { readFile } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

const PORT = 3000;
const PUBLIC_DIR = join(process.cwd(), 'public');
const SDK_SOURCE = join(
  process.cwd(),
  '../../packages/web-sdk/dist/embrace-web-sdk.js',
);

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
};

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

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (
    req.method === 'GET' &&
    (pathname === '/health-check' || pathname === '/sample-request')
  ) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  if (req.method === 'GET' && pathname === '/embrace-web-sdk.js') {
    serveFile(res, SDK_SOURCE);
    return;
  }

  if (!pathname) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  serveFile(res, join(PUBLIC_DIR, pathname));
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT.toString()}`);
});
