/* 零依赖静态服务器：node serve.mjs [目录] [端口]，默认 . 与 4500
 * 三版前台都在同一个目录树下，起一个服务就能逐个打开对比。 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, process.argv[2] || '.');
const port = Number(process.argv[3] || 4500);

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) return void res.writeHead(405).end();
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') pathname = '/index.html';
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(target, '.' + pathname);
    if (file !== target && !file.startsWith(target + path.sep)) return void res.writeHead(403).end();
    if (!(await stat(file)).isFile()) return void res.writeHead(404).end();
    const bytes = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': bytes.length, 'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`mock-platform · http://127.0.0.1:${port}/`));
