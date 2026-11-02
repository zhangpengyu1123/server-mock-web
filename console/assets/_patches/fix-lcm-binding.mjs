#!/usr/bin/env node
/* 修复：LCM 事件块被插进了 S 对象；挪到 bindView，并补状态字段 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);

// 1) 找出错插的块：从 "$$('[data-pkg-up]')" 到 该块结尾的 "});" 之后
const badStart = lines.findIndex((l) => l.includes("$$('[data-pkg-up]')"));
if (badStart < 0) { console.log('MISS bad block'); process.exit(1); }
// 块结束：找到 coBtn 处理结束（"    });" 之后紧跟 render(); 与 }); 两行）
let badEnd = badStart;
for (let i = badStart; i < Math.min(badStart + 40, lines.length); i++) {
  if (lines[i].trim() === '});' && i > badStart + 5) { badEnd = i; break; }
}
// 说明：错插块在 S 对象里，后面紧跟的是 "      });" 之类，保险起见扩展到 coBtn 结束
for (let i = badEnd; i < Math.min(badEnd + 12, lines.length); i++) {
  if (lines[i].includes("render();") && lines[i + 1] && lines[i + 1].trim() === '});') { badEnd = i + 1; break; }
}
const block = lines.slice(badStart, badEnd + 1).filter((l) => l.trim() !== '');
lines.splice(badStart, badEnd - badStart + 1);
console.log('removed lines:', block.length);

// 2) 移到 bindView：插在 "    // 平台页" 之前
const anchor = lines.findIndex((l) => l.includes('// 平台页'));
if (anchor < 0) { console.log('MISS anchor'); process.exit(1); }
lines.splice(anchor, 0, ...block, '');

// 3) 补状态字段
const stIdx = lines.findIndex((l) => l.includes('tasks: [],'));
if (stIdx > 0 && !lines.some((l) => l.includes('packages: [],'))) {
  lines.splice(stIdx + 1, 0,
    '    packages: [],      // LCM 软件包（来自后端）',
    '    platform: null,    // 平台配置（共部署 / FS）');
  console.log('ok   state fields');
}

writeFileSync(P, lines.join('\n'), 'utf8');
console.log('ok   事件块归位');
