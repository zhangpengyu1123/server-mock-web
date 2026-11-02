#!/usr/bin/env node
/* 修复网元页按钮与表单的容器嵌套：统一成一个 flex 行 + 表单块 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);

/* 找 <div class="pl-row-end"> 后紧跟 btnGroupAdd 的块 */
const start = lines.findIndex((l, i) => l.includes('id="btnGroupAdd"') && lines[i - 1].includes('pl-row-end'));
if (start < 0) { console.log('MISS start'); process.exit(1); }
const wrapper = start - 1;                        // 打开标签行
/* 找该 wrapper 的闭合 </div>（在 neForm 表单块之后） */
const formEnd = lines.findIndex((l, i) => i > start && l.includes("新建网元（写入后端）"));
let close = formEnd;
let depth = 0, started = false;
for (let i = wrapper; i < lines.length; i++) {
  const t = lines[i];
  for (let k = 0; k < t.length - 3; k++) {
    if (t.slice(k, k + 5) === '<div ') { depth++; started = true; }
    if (t.slice(k, k + 6) === '</div>') { depth--; }
    if (started && depth === 0) { close = i; break; }
  }
  if (started && depth === 0 && close === i) break;
}
console.log('wrapper L' + (wrapper + 1) + ' → 闭合 L' + (close + 1));

/* 提取表单主体（从 neForm 那段 "S.neForm.open ?" 起，到 wrapper 闭合前） */
const formStart = lines.findIndex((l, i) => i > start && l.includes('${S.neForm.open ?'));
if (formStart < 0) { console.log('MISS formStart'); process.exit(1); }

const head = [
  '            <div class="pl-row-end" style="gap:6px">',
  '              <button class="pl-btn pl-btn--sm" id="btnGroupAdd">＋ 成组</button>',
  '              <button class="pl-btn pl-btn--sm" id="btnNeForm">＋ 新建网元</button>',
  '            </div>',
];
const form = lines.slice(formStart, close);   // 表单块（含 ${S.neForm.open ? ...}）
const out = [...lines.slice(0, wrapper), ...head, ...form, ...lines.slice(close + 1)];
writeFileSync(P, out.join('\n'), 'utf8');
console.log('ok   结构已合并');
