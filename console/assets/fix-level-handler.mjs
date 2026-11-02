#!/usr/bin/env node
/* 修复层级 handler：补回 forEach 开头，修正 2D 维度赋值位置 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);

/* ① 补回 forEach 开头 */
const i = lines.findIndex((l) => /^\s*S\.topoLevel = b\.dataset\.level;\s*$/.test(l));
if (i < 0) { console.log('MISS topoLevel'); process.exit(1); }
lines.splice(i, 0, "      $$('[data-level]').forEach((b) => b.addEventListener('click', () => {");
console.log('ok   forEach 开头补回（L' + (i + 1) + '）');

/* ② 2D 维度赋值移进 b2 监听 */
const j = lines.findIndex((l) => /^\s*S\.topoDim = '2d';\s*$/.test(l));
if (j >= 0 && lines[j + 1].includes('b2.addEventListener')) {
  lines.splice(j, 1);                       // 删掉错位行
  const k = lines.findIndex((l) => l.includes("b2.addEventListener('click', () => {"));
  if (k >= 0) lines.splice(k + 1, 0, "          S.topoDim = '2d';");
  console.log('ok   2D 维度赋值归位');
}
writeFileSync(P, lines.join('\n'), 'utf8');
