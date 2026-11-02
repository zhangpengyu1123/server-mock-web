#!/usr/bin/env node
/* 3D 拓扑：流光点随选中链路联动 —— 行号定位版 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① select()：紧跟 scale 行插入光点块 */
const si = lines.findIndex((l) => l.includes('l.mesh.scale.set(hit ? 1.8'));
if (si >= 0) {
  const ind = lines[si].match(/^\s*/)[0];
  lines.splice(si + 1, 0,
    ind + '// 流光点跟随选中：命中链路亮琥珀快速，其余灰暗慢速；无选中时常态',
    ind + 'l.hot = hit;',
    ind + 'if (l.dot) {',
    ind + '  const none = !id;',
    ind + '  l.dot.material.color.setHex(none ? 0xffc978 : (hit ? 0xffd79a : 0x8f8b82));',
    ind + '  l.dot.material.emissive.setHex(none ? 0xffc978 : (hit ? 0xffc978 : 0x5c5850));',
    ind + '  l.dot.material.emissiveIntensity = none ? 1.6 : (hit ? 2.4 : 0.5);',
    ind + '  l.dot.visible = none || hit;',
    ind + '}');
  log.push('ok   select 光点块（L' + (si + 2) + '）');
} else log.push('MISS scale 行');

/* ② loop()：重写光点推进 5 行 */
const ni = lines.findIndex((l) => l.includes('const now = performance.now() / 3200;'));
if (ni >= 0) {
  let end = ni;
  while (end < lines.length && !(lines[end].includes('emissiveIntensity = 1.6 + Math.sin'))) end++;
  if (end < lines.length) {
    const ind = lines[ni].match(/^\s*/)[0];
    lines.splice(ni, end - ni + 1,
      ind + 'const speedBoost = this.selected ? 1.35 : 1;',
      ind + 'const now = (performance.now() / 3200) * speedBoost;',
      ind + 'this.links.forEach((l) => {',
      ind + '  if (!l.dot) return;',
      ind + '  const dim = this.selected && l.hot === false;',
      ind + '  const k = (((now * (dim ? 0.3 : 1)) + l.phase) % 1);',
      ind + '  const e = k < 0.5 ? k * 2 : (1 - k) * 2;   // 往返',
      ind + '  l.dot.position.lerpVectors(l.a, l.b, e);',
      ind + '  const base = dim ? 0.35 : 1.6;',
      ind + '  l.dot.material.emissiveIntensity = base + Math.sin(e * Math.PI) * base;',
      ind + '});');
    log.push('ok   loop 光点推进');
  } else log.push('MISS loop 收尾');
} else log.push('MISS loop 起点');

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
