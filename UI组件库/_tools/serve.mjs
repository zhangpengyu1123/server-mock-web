// 零依赖静态服务器，用来离线打开任意目录（例如 _micro-demo/dist）
// 用法: node _tools/serve.mjs <目录> [端口]   默认 . 与 4400
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const target = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 4400);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.md': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) return void res.writeHead(405).end();
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(target, '.' + pathname);
    if (file !== target && !file.startsWith(target + path.sep)) return void res.writeHead(403).end();
    if (!(await stat(file)).isFile()) return void res.writeHead(404).end();
    const bytes = await readFile(file);
    const type = types[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`serving ${target} · http://127.0.0.1:${port}/`));
