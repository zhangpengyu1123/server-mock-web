#!/usr/bin/env node
/* 去重：同名视图函数只保留最后一次定义（JS 里后定义生效），删除之前的重复块 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
const lines = readFileSync(P, 'utf8').split(/\r?\n/);

/** 找到从 start 行开始的函数块结束行（按花括号配平，忽略字符串里的括号风险较低） */
function blockEnd(start) {
  let depth = 0, started = false;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    for (const ch of l) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; }
    }
    if (started && depth === 0) return i;
  }
  return -1;
}

const defs = new Map(); // name -> [startIdx...]
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^  function (\w+)\(\)\s*\{/);
  if (!m) continue;
  if (!defs.has(m[1])) defs.set(m[1], []);
  defs.get(m[1]).push(i);
}

const removeRanges = [];
for (const [name, idxs] of defs) {
  if (idxs.length < 2) continue;
  // 保留最后一个，删除其前面的
  for (let k = 0; k < idxs.length - 1; k++) {
    const s = idxs[k];
    const e = blockEnd(s);
    if (e > s) removeRanges.push([s, e, name]);
  }
}

removeRanges.sort((a, b) => b[0] - a[0]);
for (const [s, e, name] of removeRanges) {
  lines.splice(s, e - s + 1);
  console.log(`删除重复 ${name} (行 ${s + 1}-${e + 1})`);
}

writeFileSync(P, lines.join('\n'), 'utf8');
const rest = new Map();
lines.forEach((l) => { const m = l.match(/^  function (\w+)\(\)\s*\{/); if (m) rest.set(m[1], (rest.get(m[1]) || 0) + 1); });
console.log('剩余重复:', [...rest].filter(([, n]) => n > 1).map(([k, n]) => k + '×' + n).join(', ') || '无');
