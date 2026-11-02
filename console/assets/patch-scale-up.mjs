#!/usr/bin/env node
/* 小幅放大：板宽 0.46→0.56、卡片 +15%、卡间距 0.170→0.195 */
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
  [/"w": 0\.460, "d": 1\.020, "t": 0\.050,/, `"w": 0.560, "d": 1.020, "t": 0.050,`, 'board w'],
  [/"slot_pitch": 0\.170, "slot_count": 5,/, `"slot_pitch": 0.195, "slot_count": 5,`, 'card pitch'],
  [/"w": 0\.340, "h": 0\.360, "t": 0\.018,/, `"w": 0.390, "h": 0.410, "t": 0.020,`, 'card size'],
  [/"plug_w": 0\.090, "plug_h": 0\.040,/, `"plug_w": 0.100, "plug_h": 0.044,`, 'plug'],
  [/    return \[-0\.300 \+ i \* s\["slot_pitch"\] for i in range\(n\)\]/, `    return [-0.360 + i * s["slot_pitch"] for i in range(n)]`, 'slot start'],
]);

patch('console/ui/admin/scene.js', [
  [/  bayPitchY: 0\.170, bayY0: -0\.300,  \/\/ 间距拉开 2x，侧视可见更多卡面/, `  bayPitchY: 0.195, bayY0: -0.360,  // 间距再放宽，侧视能看到每张卡的铭牌`, 'bay pitch'],
  // 铭牌跟着卡片变大（+15%）
  [/      const plateW = tall \? 0\.300 : 0\.286;/, `      const plateW = tall ? 0.345 : 0.330;`, 'plate w'],
  [/      const plateH = tall \? 0\.076 : 0\.068;/, `      const plateH = tall ? 0.088 : 0.078;`, 'plate h'],
  [/      const plateYc = tall \? 0\.352 : 0\.322;/, `      const plateYc = tall ? 0.398 : 0.360;`, 'plate y'],
]);

console.log(log.join('\n'));
