#!/usr/bin/env node
/* 等价复刻 deploy/nginx/blackbox.conf 的响应行为（用于在没有 nginx 的机器上验证策略）
 *   node deploy/_verify/simulate-nginx.mjs [port]
 * 复刻项：目录索引解析、HTML no-cache / 资源 10min、gzip、安全头 + CSP、隐藏文件 403、404 回首页
 * 不复刻：nginx 语法、HTTP/2、sendfile、真实连接模型 —— 这些只能上 VM 用 nginx -t 验
 */
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] || 8099);
const ROOT_DIR = fileURLToPath(new URL('../dist/site/', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};
const GZIP_TYPES = new Set(['text/html', 'text/css', 'application/javascript', 'application/json', 'image/svg+xml', 'text/plain']);

const CSP = "default-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': CSP
};

function resolve(reqUrl) {
  let p = decodeURIComponent(reqUrl.split('?')[0]);
  if (p.includes('\0')) return { status: 400 };
  // 隐藏文件判定要在 normalize 之前做：Windows 的 normalize 会换成反斜杠
  if (/(^|\/)\.(?!well-known)/.test(p)) return { status: 403 };
  p = normalize(p).replace(/^(\.\.[/\\])+/, '');
  const abs = join(ROOT_DIR, p);
  if (!abs.startsWith(ROOT_DIR)) return { status: 403 };
  if (existsSync(abs) && statSync(abs).isDirectory()) {
    const idx = join(abs, 'index.html');
    return existsSync(idx) ? { file: idx, expires: 'no-cache' } : { status: 403 };
  }
  if (existsSync(abs) && statSync(abs).isFile()) {
    const ext = extname(abs).toLowerCase();
    const isHtml = ext === '.html';
    return { file: abs, expires: isHtml ? 'no-cache' : 'public, max-age=600' };
  }
  return { status: 404 };
}

createServer((req, res) => {
  const r = resolve(req.url);
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'Server': 'nginx', ...SEC, ...headers });
    res.end(body);
  };
  if (r.status) {
    // 与 conf 的 error_page 404 /index.html 对齐
    if (r.status === 404) {
      const idx = join(ROOT_DIR, 'index.html');
      return send(404, readFileSync(idx), { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    }
    return send(r.status, 'denied', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  const body = readFileSync(r.file);
  const type = MIME[extname(r.file).toLowerCase()] || 'application/octet-stream';
  const base = GZIP_TYPES.has(type.split(';')[0]) ? type.split(';')[0] : type;
  const headers = { 'Content-Type': type, 'Cache-Control': r.expires, 'ETag': '"' + body.length.toString(16) + '-' + Date.now().toString(36) + '"' };
  const accepts = String(req.headers['accept-encoding'] || '');
  if (body.length >= 1024 && /gzip/.test(accepts) && GZIP_TYPES.has(base)) {
    const z = gzipSync(body, { level: 6 });
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
    return send(200, z, headers);
  }
  send(200, body, headers);
}).listen(PORT, '127.0.0.1', () => {
  console.log('simulate-nginx on http://127.0.0.1:' + PORT + '  root=' + ROOT_DIR);
});
