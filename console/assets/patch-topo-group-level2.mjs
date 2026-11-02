#!/usr/bin/env node
/* 组级视图 2D + 层级联动（按行号定位） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① 2D group 分支：定位 "} else if (S.topoLevel === 'group') {" 到 "} else {" */
const s = lines.findIndex((l) => l.includes("} else if (S.topoLevel === 'group') {"));
if (s < 0) { console.log('MISS 2D group'); process.exit(1); }
let e = s;
let depth = 0, started = false;
for (let i = s; i < lines.length; i++) {
  for (const ch of lines[i]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
  if (started && depth === 0) { e = i; break; }
}
const block = String.raw`      } else if (S.topoLevel === 'group') {
        // 组视角：站点 → 选中的组 → 组内网元（横向展开）
        const g = S.groups.find((x) => x.id === S.topoSel) || S.groups[0];
        mk('site', 360, 20, 180, 38, S.site.name, 'SITE · ' + S.site.role, 'site');
        if (g) {
          mk(g.id, 350, 110, 200, 44, g.name, 'GROUP · ' + g.elements.length + ' NE', 'group');
          links.push(['site', g.id]);
          const members = g.elements.map((id) => S.elements.find((x) => x.id === id)).filter(Boolean);
          members.forEach((m, i) => {
            const n = members.length;
            const x = n === 1 ? 360 : 40 + (640 / (n - 1)) * i;
            mk(m.id, x, 230, 170, 44, m.name, m.type + ' · v' + m.version, 'ne');
            links.push([g.id, m.id]);
          });
        }
        // 其他组：右侧速览
        S.groups.filter((x) => !g || x.id !== g.id).forEach((x, i) => {
          mk('go-' + x.id, 700, 20 + i * 32, 160, 26, x.name, x.elements.length + ' NE', 'group');
        });`.split('\n');

lines = [...lines.slice(0, s), ...block, ...lines.slice(e + 1)];
log.push('ok   2D 组级分支');

/* ② 层级按钮联动：点击时补齐 topoSel */
const bi = lines.findIndex((l) => l.includes("$$('[data-level]').forEach"));
if (bi >= 0 && lines[bi].includes("S.topoLevel = b.dataset.level")) {
  const inline = lines[bi];
  const rest = inline.split("S.topoLevel = b.dataset.level;").slice(1).join('S.topoLevel = b.dataset.level;');
  lines[bi] = "        S.topoLevel = b.dataset.level;";
  lines.splice(bi + 1, 0,
    "        if (S.topoLevel === 'group' && !String(S.topoSel || '').startsWith('g-')) {",
    "          S.topoSel = (S.groups[0] || {}).id || S.topoSel;",
    "        }",
    "        if (S.topoLevel === 'component' && !S.elements.find((x) => x.id === S.topoSel)) {",
    "          S.topoSel = (S.elements[0] || {}).id || S.topoSel;",
    "        }");
  if (rest.trim()) lines.splice(bi + 7, 0, '        ' + rest.trim());
  log.push('ok   层级联动');
}

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
