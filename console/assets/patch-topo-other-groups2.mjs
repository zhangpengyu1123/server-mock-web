#!/usr/bin/env node
/* 组级 2D 伪 id 点击 + 3D 组拾取重建（按行匹配，忽略缩进） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① 2D：g.addEventListener('click', () => { S.topoSel = g.dataset.node; ... */
const s = lines.findIndex((l) => l.includes("g.addEventListener('click', () => {"));
if (s >= 0) {
  let e = s;
  while (e < lines.length && !/^\s*\}\);\s*$/.test(lines[e])) e++;
  const indent = lines[s].match(/^\s*/)[0];
  const body = `g.addEventListener('click', () => {
  const raw = g.dataset.node || '';
  if (raw.startsWith('go-')) { S.topoSel = raw.slice(3); S.topoLevel = 'group'; }
  else { S.topoSel = raw; }
  renderTopo();
  renderTopoDetail();
  if (window.PlaneTopo3D && S.topoDim === '3d') window.PlaneTopo3D.rebuild();
});`.split('\n').map((l) => indent + l);
  lines.splice(s, e - s + 1, ...body);
  log.push('ok   2D 伪 id 点击');
} else log.push('MISS 2D click');

/* ② 3D onPick：切组后重建 */
const pi = lines.findIndex((l) => l.includes("(id) => { S.topoSel = id; renderTopoDetail(); },"));
if (pi >= 0) {
  const indent = lines[pi].match(/^\s*/)[0];
  lines.splice(pi, 1,
    indent + "(id, data) => {",
    indent + "  S.topoSel = id;",
    indent + "  if (S.topoLevel === 'group' && data && data.kind === 'group' && window.PlaneTopo3D) window.PlaneTopo3D.rebuild();",
    indent + "  renderTopoDetail();",
    indent + "},");
  log.push('ok   3D 组拾取重建');
} else log.push('MISS 3D onPick');

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
