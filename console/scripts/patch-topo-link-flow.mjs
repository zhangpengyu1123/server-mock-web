#!/usr/bin/env node
/* 3D 拓扑：流光点随选中链路联动（命中=亮琥珀快速，未命中=灰暗慢速） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① select()：为每条链路记录 hot，并调整光点 */
const si = lines.findIndex((l) => l.includes('this.links || []).forEach((l) => {') && l.includes('forEach'));
if (si < 0) { console.log('MISS select links'); process.exit(1); }
// 找到该 forEach 的结束位置（缩进相同的 "});"）
let se = si;
const indent = lines[si].match(/^\s*/)[0];
while (se < lines.length && !(lines[se].startsWith(indent + '});') && se > si)) se++;
if (se >= lines.length) { console.log('MISS select end'); process.exit(1); }
const extra = [
  indent + '      l.hot = hit;',
  indent + '      if (l.dot) {',
  indent + '        l.dot.material.color.setHex(hit ? 0xffd79a : 0x8f8b82);',
  indent + '        l.dot.material.emissive.setHex(hit ? 0xffc978 : 0x5c5850);',
  indent + '        l.dot.material.emissiveIntensity = hit ? 2.2 : 0.5;',
  indent + '        l.dot.visible = hit || !id;',
  indent + '      }',
  indent + '    });',
];
// 用新块替换原块尾部的 "});"
lines.splice(se, 1, ...extra);
log.push('ok   select() 光点联动');

/* ② loop()：按 hot 调整速度与亮度 */
const li = lines.findIndex((l) => l.includes('const now = performance.now() / 3200;'));
if (li >= 0) {
  lines[li] = '        const now = performance.now() / (this.selected ? 2600 : 3200);';
  const ki = lines.findIndex((l, i) => i > li && l.includes('const k = ((now + l.phase) % 1);'));
  if (ki >= 0) {
    lines.splice(ki + 1, 0, '          const speed = this.selected && l.hot === false ? 0.35 : 1;');
    lines[ki] = '          const k = ((now * speed + l.phase) % 1);';
  }
  const gi = lines.findIndex((l, i) => i > li && l.includes('l.dot.material.emissiveIntensity = 1.6 +'));
  if (gi >= 0) {
    lines[gi] = '          const base = this.selected && l.hot === false ? 0.35 : 1.6;';
    lines.splice(gi + 1, 0, '          l.dot.material.emissiveIntensity = base + Math.sin(e * Math.PI) * base;');
  }
  log.push('ok   loop() 速度/亮度联动');
} else log.push('MISS loop now');

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
