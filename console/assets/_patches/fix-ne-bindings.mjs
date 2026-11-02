#!/usr/bin/env node
/* 用行号定位方式替换 新建/复制 网元的绑定为真实 API 调用 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
const lines = readFileSync(P, 'utf8').split(/\r?\n/);

// 找到 btnNeAdd 绑定块
let start = lines.findIndex((l) => l.includes("const na = $('#btnNeAdd');"));
if (start < 0) { console.log('MISS btnNeAdd'); process.exit(1); }
let end = -1;
for (let i = start; i < Math.min(start + 20, lines.length); i++) {
  if (lines[i].trim() === '});') { end = i; break; }
}
const addBlock = [
  "    const na = $('#btnNeAdd');",
  "    if (na) na.addEventListener('click', async () => {",
  "      try {",
  "        await api('/api/business/elements', {",
  "          method: 'POST', headers: headers(),",
  "          body: JSON.stringify({",
  "            name: 'gNB-HZ-09' + String(10 + S.elements.length),",
  "            arch: 'SA', kind: 'gNB', version: '5.2.1', software: 'NR-RAN',",
  "            group: (S.groups[0] || {}).id || '',",
  "            components: ['主控板', '业务板', '电源'],",
  "          }),",
  "        });",
  "        await loadElements();",
  "      } catch (e) { console.warn(e); }",
  "      render();",
  "    });",
];
lines.splice(start, end - start + 1, ...addBlock);

// 找到 data-ne-copy 绑定块
let c0 = lines.findIndex((l) => l.includes("$$('[data-ne-copy]')"));
if (c0 < 0) { console.log('MISS ne-copy'); process.exit(1); }
let c1 = -1;
for (let i = c0; i < Math.min(c0 + 20, lines.length); i++) {
  if (lines[i].trim() === '}));') { c1 = i; break; }
}
const copyBlock = [
  "    $$('[data-ne-copy]').forEach((b) => b.addEventListener('click', async () => {",
  "      try {",
  "        await api('/api/business/elements/' + b.dataset.neCopy + '/copy', {",
  "          method: 'POST', headers: headers(), body: '{}',",
  "        });",
  "        await loadElements();",
  "      } catch (e) { console.warn(e); }",
  "      render();",
  "    }));",
];
lines.splice(c0, c1 - c0 + 1, ...copyBlock);

writeFileSync(P, lines.join('\n'), 'utf8');
console.log('ok   新建/复制 网元接 API');
