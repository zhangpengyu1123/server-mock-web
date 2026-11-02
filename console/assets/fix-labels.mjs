#!/usr/bin/env node
/* 修：铭牌被凹位遮挡（z 差 0.2mm）+ 字号过小 → 名字看不见 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/admin/scene.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  const isRe = from instanceof RegExp;
  const hit = isRe ? from.test(t) : t.includes(from);
  if (!hit) { log.push('MISS ' + tag); if (isRe) from.lastIndex = 0; return; }
  t = isRe ? t.replace(from, () => to) : t.split(from).join(to);
  log.push('ok   ' + tag);
};

// 1) 铭牌平面前移到深色凹位之外（凹位前表面在 +0.0108，原来只到 0.0106 → 被完全挡住）
rep(`plate.position.set(0, plateYc, G.cardT / 2 + 0.0016);`,
    `plate.position.set(0, plateYc, G.cardT / 2 + 0.0036);   // 前移 2mm，跳出铭牌凹位`, 'plate z');

// 2) 画布与字号：2 倍分辨率 + 主标 110px
rep(`  const W = 1024, H = 256;`, `  const W = 2048, H = 512;`, 'canvas size');
rep(`{ big: 72, code: kind,`, `{ big: 110, code: kind,`, 'big font');
rep(`g.font = '500 40px "JetBrains Mono",ui-monospace,Consolas,monospace';`,
    `g.font = '500 54px "JetBrains Mono",ui-monospace,Consolas,monospace';`, 'sub font');
rep(`g.font = '500 30px ui-monospace,Consolas,monospace';`,
    `g.font = '500 42px ui-monospace,Consolas,monospace';`, 'code font');

// 3) 主板信息铭牌同步放大（节点名）
rep(`{ big: 92, code: 'X-' + String(bi + 1).padStart(3, '0'), accent: '#d79a44' });`,
    `{ big: 120, code: 'X-' + String(bi + 1).padStart(3, '0'), accent: '#d79a44' });`, 'board plate font');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
