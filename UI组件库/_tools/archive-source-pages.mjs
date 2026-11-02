// 归档来源网页（time.jamecling.com 上介绍 Shaders / Micro 的两篇文章）
// 用法: node _tools/archive-source-pages.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '_来源网页');

const pages = [
  { name: 'time.jamecling.com-bookmark-shaders', url: 'https://time.jamecling.com/bookmark-shaders' },
  { name: 'time.jamecling.com-bookmark-micro', url: 'https://time.jamecling.com/bookmark-micro' },
];

function toText(html) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|article|section|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const entities = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&apos;': "'", '&hellip;': '…', '&mdash;': '—', '&ndash;': '–',
  };
  s = s.replace(/&[a-zA-Z#0-9]+;/g, (m) => entities[m] ?? m);
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, a) => l !== '' || (a[i - 1] ?? '') !== '')
    .join('\n')
    .trim();
}

await mkdir(outDir, { recursive: true });
const index = [];
for (const p of pages) {
  const res = await fetch(p.url, { headers: { 'user-agent': 'Mozilla/5.0 (archive script)' } });
  const html = await res.text();
  await writeFile(join(outDir, `${p.name}.html`), html, 'utf8');
  const text = toText(html);
  await writeFile(join(outDir, `${p.name}.txt`), `来源: ${p.url}\nHTTP: ${res.status}\n\n${text}\n`, 'utf8');
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) ?? [, '?'])[1].trim();
  index.push({ name: p.name, url: p.url, status: res.status, bytes: html.length, title });
  console.log(`${res.status} ${p.url} -> ${p.name} (${html.length} bytes) :: ${title}`);
}
await writeFile(join(outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
console.log('done ->', outDir);
