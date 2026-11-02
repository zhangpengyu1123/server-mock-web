#!/usr/bin/env node
/* 用行号定位插入：记住 2D/3D + 重渲染后恢复 3D */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
const lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

// 1) b2 处理：插入 remembered flag
let i2 = lines.findIndex((l) => l.includes("b2.addEventListener('click'"));
let i3 = lines.findIndex((l) => l.includes("b3.addEventListener('click'"));
if (i2 >= 0) { lines.splice(i2, 0, "        S.topoDim = '2d';"); log.push('ok   2d 记忆'); }
if (i3 > i2) { i3 += 1; }
if (i3 >= 0) { lines.splice(i3, 0, "        S.topoDim = '3d';"); log.push('ok   3d 记忆'); }

// 2) bindView 末尾恢复 3D：找 "  function render() {" 之前的 bindView 结尾
const rb = lines.findIndex((l) => l.includes('function render() {'));
if (rb > 0) {
  const ins = [
    "    // 当前维度是 3D 时，重渲染后自动恢复（切层级/刷新数据不丢 3D）",
    "    if (S.view === 'topo' && S.topoDim === '3d') {",
    "      const b3now = $('#btn3d');",
    "      if (b3now) setTimeout(() => b3now.click(), 0);",
    "    }",
  ];
  // 插入到 render 定义之前最后一个空行处
  let pos = rb;
  while (pos > 0 && lines[pos - 1].trim() !== '') pos--;
  lines.splice(pos, 0, ...ins, '');
  log.push('ok   恢复 3D');
}

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
