#!/usr/bin/env node
/* 收尾：板宽改 0.56，并去掉浮板后处理里的"缩放"（改为完全按 v7 SPEC 尺寸） */
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

// v7：板宽 0.46 → 0.56（唯一一处 "w": 0.4xx 在 board SPEC 里）
patch('console/assets/blender/build_rhine_assets_v7.py', [
  [/"w": 0\.460,/"w": 0.560/, 'v7 board w'],
]);

// 浮板后处理：不再缩放板体（尺寸由 v7 SPEC 决定），只砍腿 + 加信息区
patch('console/assets/blender/build_float_board.py', [
  [/slab = bpy\.data\.objects\.get\("GEO_Board_Slab"\)\nif slab:\n[\s\S]*?    bpy\.ops\.object\.transform_apply\(location=False, rotation=False, scale=True\)\n/,
   `slab = bpy.data.objects.get("GEO_Board_Slab")
# 尺寸完全由 v7 SPEC 决定，这里不再缩放（避免与 SPEC 冲突）
`,
   'drop slab scale'],
]);

console.log(log.join('\n'));
