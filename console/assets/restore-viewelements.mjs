#!/usr/bin/env node
/* 从 HEAD 取回 viewElements，插入到 viewTopo 之前 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'console/ui/business/plane.js';
const head = execSync('git show HEAD:console/ui/business/plane.js', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const hl = head.split(/\r?\n/);
const s = hl.findIndex((l) => /^  function viewElements\(\) \{/.test(l));
if (s < 0) { console.log('MISS viewElements in HEAD'); process.exit(1); }
let e = s;
while (e < hl.length && !/^  function viewTopo/.test(hl[e]) && !/^  \/\* -+ /.test(hl[e])) e++;
while (e > s && hl[e - 1].trim() === '') e--;
const block = hl.slice(s, e);
console.log('抓到 viewElements 行数:', block.length);

const cur = readFileSync(P, 'utf8').split(/\r?\n/);
const at = cur.findIndex((l) => /^  function viewTopo\(\) \{/.test(l));
if (at < 0) { console.log('MISS viewTopo'); process.exit(1); }
const out = [...cur.slice(0, at), ...block, '', ...cur.slice(at)];
writeFileSync(P, out.join('\n'), 'utf8');
console.log('ok   已插回 viewElements（插在 L' + (at + 1) + ' 前）');
