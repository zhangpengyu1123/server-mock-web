#!/usr/bin/env node
/* 修正 loop() 里的变量顺序（speed 必须在 k 之前声明），并核对 select() 光点块 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

const ki = lines.findIndex((l) => l.includes('const k = ((now * speed + l.phase) % 1);'));
if (ki >= 0) {
  // 移除错位的 speed 行
  const si = lines.findIndex((l) => l.includes('const speed = this.selected && l.hot === false ? 0.35 : 1;'));
  if (si >= 0 && si !== ki - 1) lines.splice(si, 1);
  const k2 = lines.findIndex((l) => l.includes('const k = ((now * speed + l.phase) % 1);'));
  const indent = lines[k2].match(/^\s*/)[0];
  lines.splice(k2, 1,
    indent + 'const speed = this.selected && l.hot === false ? 0.35 : 1;',
    indent + 'const k = ((now * speed + l.phase) % 1);');
  log.push('ok   speed 前置');
}

// 统一 loop 内缩进（4 空格层级）
const li = lines.findIndex((l) => l.includes('const now = performance.now() / (this.selected ? 2600'));
if (li >= 0) lines[li] = '        ' + lines[li].trim();
const di = lines.findIndex((l) => l.includes('l.dot.material.emissiveIntensity = base + Math.sin'));
if (di >= 0) {
  lines[di - 1] = '          ' + lines[di - 1].trim();
  lines[di] = '          ' + lines[di].trim();
  log.push('ok   缩进统一');
}

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
