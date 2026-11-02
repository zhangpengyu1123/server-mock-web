#!/usr/bin/env node
/* 拓扑方向语义（行号定位）：箭头 + 单向流光 + 选中联动 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① edge()：在 links.push 之前插入箭头，并把 arrow 放进 link 记录 */
const pi = lines.findIndex((l) => l.includes('this.links.push({ from: idA, to: idB, mesh: m, dot,'));
if (pi >= 0) {
  const ind = lines[pi].match(/^\s*/)[0];
  lines.splice(pi, 1,
    ind + '// 方向箭头：链路中点的小圆锥，指向子节点（父 → 子的数据方向）',
    ind + 'const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);',
    ind + 'const dir = new THREE.Vector3().subVectors(vb, va).normalize();',
    ind + 'const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.020, 0.055, 8), glow(0xffc978, 1.2).clone());',
    ind + 'arrow.position.copy(va).addScaledVector(dir, 0.58);',
    ind + 'arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);',
    ind + 'this.root.add(arrow);',
    '',
    ind + 'this.links.push({ from: idA, to: idB, mesh: m, dot, arrow, a: va, b: vb, phase: Math.random() });');
  log.push('ok   edge 箭头（L' + (pi + 1) + '）');
} else log.push('MISS links.push');

/* ② loop()：往返 → 单向 + 两端淡入淡出 */
const ki = lines.findIndex((l) => l.includes('const k = (((now * (dim ? 0.3 : 1)) + l.phase) % 1);'));
if (ki >= 0) {
  const ind = lines[ki].match(/^\s*/)[0];
  lines.splice(ki, 2,
    ind + 'const e = (((now * (dim ? 0.3 : 1)) + l.phase) % 1);   // 单向：父 → 子，到终点重生');
  const gi = lines.findIndex((l) => l.includes('l.dot.material.emissiveIntensity = base + Math.sin(e * Math.PI) * base;'));
  if (gi >= 0) {
    const ind2 = lines[gi].match(/^\s*/)[0];
    lines[gi] = ind2 + 'const fade = Math.sin(e * Math.PI);';
    lines.splice(gi + 1, 0, ind2 + 'l.dot.material.emissiveIntensity = base * (0.35 + fade);');
  }
  log.push('ok   loop 单向');
} else log.push('MISS loop k');

/* ③ select()：箭头随选中联动 */
const vi = lines.findIndex((l) => l.includes('l.dot.visible = none || hit;'));
if (vi >= 0) {
  const ind = lines[vi].match(/^\s*/)[0];
  const close = vi + 1;   // 缩进块的 "}" 行
  lines.splice(close + 1, 0,
    ind + 'if (l.arrow) {',
    ind + '  const none2 = !id;',
    ind + '  l.arrow.material.color.setHex(none2 ? 0xffc978 : (hit ? 0xffd79a : 0x9a948a));',
    ind + '  l.arrow.material.emissiveIntensity = none2 ? 1.2 : (hit ? 2.0 : 0.25);',
    ind + '  l.arrow.visible = none2 || hit;',
    ind + '}');
  log.push('ok   select 箭头联动');
} else log.push('MISS dot.visible');

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
