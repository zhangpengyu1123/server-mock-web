#!/usr/bin/env node
/* 清理 renderTopo 组级分支残留：删除新块后面残留的旧 element 平铺代码 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);

const start = lines.findIndex((l) => l.includes("} else if (S.topoLevel === 'group') {"));
if (start < 0) { console.log('MISS'); process.exit(1); }
// 找新块结尾：'其他组：右侧速览' 后的 forEach 结束（以 "        });" 结尾，下一行以 mk('site', 360, 24 开头）
let tail = start;
while (tail < lines.length && !lines[tail].includes("mk('site', 360, 24, 170, 40")) tail++;
if (tail >= lines.length) { console.log('MISS tail'); process.exit(1); }
// 删除残留旧代码：从 tail 到下一个 "      } else {" 之前
let tailEnd = tail;
while (tailEnd < lines.length && !lines[tailEnd].includes('} else {')) tailEnd++;
console.log('删除残留行 ' + (tail + 1) + ' - ' + tailEnd);
lines = [...lines.slice(0, tail), ...lines.slice(tailEnd)];
writeFileSync(P, lines.join('\n'), 'utf8');
console.log('ok   残留已删');
