#!/usr/bin/env node
/* 删除新建网元 handler 替换后残留的 4 行旧代码 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const i = lines.findIndex((l, k) =>
  /^\s*await loadElements\(\);\s*$/.test(l) &&
  /console\.warn\(e\)/.test(lines[k + 1] || '') &&
  /^\s*render\(\);\s*$/.test(lines[k + 2] || '') &&
  /^\s*\}\);\s*$/.test(lines[k + 3] || '') &&
  /^\s*\}\);\s*$/.test(lines[k - 1] || ''));
if (i < 0) { console.log('MISS 残留块'); process.exit(1); }
lines.splice(i, 4);
writeFileSync(P, lines.join('\n'), 'utf8');
console.log('ok   残留已删（L' + (i + 1) + ' 起 4 行）');
