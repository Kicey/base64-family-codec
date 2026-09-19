import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL(process.argv.includes('--dist') ? '../dist/' : '../', import.meta.url));
const basePath = '/base64-family-codec/';
const port = Number(process.env.PORT ?? 4173);
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/' || pathname === basePath.slice(0, -1)) {
      response.writeHead(302, { Location: basePath }).end();
      return;
    }
    if (!pathname.startsWith(basePath)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const relativePath = pathname.slice(basePath.length) || 'index.html';
    // Serve only public application assets, never repository metadata or scripts.
    if (!['index.html', 'favicon.svg'].includes(relativePath) && !relativePath.startsWith('src/')) {
      response.writeHead(404).end('Not found');
      return;
    }
    const file = resolve(root, relativePath);
    if (!file.startsWith(resolve(root) + sep) || relativePath.split('/').some((part) => part.startsWith('.'))) {
      response.writeHead(404).end('Not found');
      return;
    }
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': `${contentTypes[extname(file)] ?? 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Base64 family codec: http://127.0.0.1:${port}${basePath}`);
});
