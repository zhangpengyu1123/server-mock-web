#!/usr/bin/env node
/* 用外部文本块替换 OMC 账号表（避免脚本内模板插值） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
const BLOCK = 'console/assets/omc-accounts-block.txt';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const block = readFileSync(BLOCK, 'utf8').replace(/\r/g, '').replace(/\n$/, '').split('\n');

const th = lines.findIndex((l) => l.includes('<thead><tr><th>Account</th><th>Role</th><th>Scope</th></tr></thead>'));
if (th < 0) { console.log('MISS thead'); process.exit(1); }
const end = lines.findIndex((l, i) => i > th && l.includes('</table>'));
if (end < 0) { console.log('MISS table end'); process.exit(1); }

lines = [...lines.slice(0, th), ...block, ...lines.slice(end + 1)];
writeFileSync(P, lines.join('\n'), 'utf8');
console.log('ok   账号表替换完成（' + (th + 1) + ' - ' + (end + 1) + ' → ' + block.length + ' 行）');
