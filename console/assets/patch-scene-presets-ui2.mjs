#!/usr/bin/env node
/* 场景库 UI（行号定位版） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① 预置场景下拉插在"导出场景"按钮所在行的上一行前 */
let bi = lines.findIndex((l) => l.includes('id="btnSceneExport"'));
if (bi > 0) {
  const block = `        <div class="pl-row-end" style="justify-content:flex-start;gap:8px;margin-bottom:8px">
          <select id="scenePick" style="font:inherit;font-size:10px;padding:6px 8px;background:#fff;border:1px solid var(--line-2);min-width:170px">
            <option value="">— 选择预置教学场景 —</option>
            \${(S.scenes || []).map((s) => \`<option value="\${esc(s.file)}">\${esc(s.name)}</option>\`).join('')}
          </select>
          <button class="pl-btn pl-btn--sm" id="btnScenePreset">载入</button>
        </div>`.split('\n');
  lines = [...lines.slice(0, bi - 2), ...block, ...lines.slice(bi - 2)];
  log.push('ok   预置场景下拉');
}

/* ② 启动时拉 index.json */
const li = lines.findIndex((l) => l.includes("api('/api/business/human-template')"));
if (li >= 0) {
  lines.splice(li + 1, 0,
    "      try { S.scenes = await fetch('./scenes/index.json', { cache: 'no-store' }).then((r) => r.json()); } catch (e) { S.scenes = []; }");
  log.push('ok   载入场景索引');
}

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
