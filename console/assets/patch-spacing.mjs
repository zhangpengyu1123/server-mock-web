#!/usr/bin/env node
/* 拉开卡片间距：pitch 0.082 → 0.170，板深 0.82 → 1.02（5 张仍放得下）
   同步：槽位起点、scene.js 的 bayPitchY/bayY0、信息区 z 位置 */
import { readFileSync, writeFileSync } from 'node:fs';
const log = [];
function patch(file, pairs) {
  let t = readFileSync(file, 'utf8');
  for (const [from, to, tag] of pairs) {
    const isRe = from instanceof RegExp;
    const hit = isRe ? from.test(t) : t.includes(from);
    if (!hit) { log.push('MISS ' + tag); if (isRe) from.lastIndex = 0; continue; }
    t = isRe ? t.replace(from, () => to) : t.split(from).join(to);
    log.push('ok   ' + tag);
  }
  writeFileSync(file, t, 'utf8');
}

patch('console/assets/blender/build_rhine_assets_v7.py', [
  [/"slot_pitch": 0\.082, "slot_count": 5,      # 沿深度 Y 并排，面贴面/, `"slot_pitch": 0.170, "slot_count": 5,      # 间距拉开：侧视能看全每张卡的信息`, 'pitch'],
  [/"w": 0\.460, "d": 0\.820, "t": 0\.050,/, `"w": 0.460, "d": 1.020, "t": 0.050,`, 'board depth'],
  [/    return \[0\.040 \+ i \* s\["slot_pitch"\] for i in range\(n\)\]/, `    return [-0.300 + i * s["slot_pitch"] for i in range(n)]`, 'slot start'],
]);

patch('console/ui/admin/scene.js', [
  [/  bayPitchY: 0\.082, bayY0: 0\.040,   \/\/ 卡槽集中在 \+Y 一侧/, `  bayPitchY: 0.170, bayY0: -0.300,  // 间距拉开 2x，侧视可见更多卡面`, 'bay pitch'],
  [/  infoZ: 0\.172,/, `  infoZ: 0.380,`, 'info z'],
  [/  railZ: 0\.405,/, `  railZ: 0.495,`, 'rail z'],
]);

console.log(log.join('\n'));
