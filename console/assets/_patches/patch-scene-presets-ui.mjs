#!/usr/bin/env node
/* 场景库 UI：从 ./scenes/index.json 载入预置场景 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 状态 */
rep(`    sceneMsg: '',       // 场景导入/导出提示`,
    `    sceneMsg: '',       // 场景导入/导出提示
    scenes: [],         // 内置教学场景（./scenes/index.json）`, 'state scenes');

/* 卡片里加"预置场景"下拉 */
rep(`        <div class="pl-row-end" style="justify-content:flex-start;gap:8px">
          <button class="pl-btn pl-btn--sm" id="btnSceneExport">↓ 导出场景</button>`,
`        <div class="pl-row-end" style="justify-content:flex-start;gap:8px;margin-bottom:8px">
          <select id="scenePick" style="font:inherit;font-size:10px;padding:6px 8px;background:#fff;border:1px solid var(--line-2);min-width:180px">
            <option value="">— 选择预置教学场景 —</option>
            \${(S.scenes || []).map((s) => \`<option value="\${esc(s.file)}">\${esc(s.name)}</option>\`).join('')}
          </select>
          <button class="pl-btn pl-btn--sm" id="btnScenePreset">载入</button>
        </div>
        <div class="pl-row-end" style="justify-content:flex-start;gap:8px">
          <button class="pl-btn pl-btn--sm" id="btnSceneExport">↓ 导出场景</button>`, 'preset select');

/* 事件：载入预置 */
rep(`    // 场景导出 / 导入`,
`    // 预置教学场景
    const presetBtn = $('#btnScenePreset');
    if (presetBtn) presetBtn.addEventListener('click', async () => {
      const pick = $('#scenePick');
      const file = pick && pick.value;
      if (!file) { S.sceneMsg = '先选一个场景'; render(); return; }
      try {
        const payload = await api('./scenes/' + file, { raw: true }).catch(() => null)
          || await fetch('./scenes/' + file, { cache: 'no-store' }).then((r) => r.json());
        const res = await api('/api/business/import', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
        await Promise.all([loadEndpoint(), loadElements(), loadLcm(), loadHuman(), loadTasks(), loadIfaces()]);
        S.sceneMsg = '已载入「' + ((S.scenes.find((s) => s.file === file) || {}).name || file) + '」' + (res.imported || 0) + ' 条 ✓';
      } catch (e) { S.sceneMsg = '载入失败：' + e.message; }
      setTimeout(() => { S.sceneMsg = ''; if (S.view === 'mock-admin') render(); }, 3200);
      render();
    });

    // 场景导出 / 导入`, 'preset binding');

/* 启动时拉场景索引 */
rep(`      try { S.human = await api('/api/business/human-template'); } catch (e) { /* 离线 */ }`,
`      try { S.human = await api('/api/business/human-template'); } catch (e) { /* 离线 */ }
      try { S.scenes = await fetch('./scenes/index.json', { cache: 'no-store' }).then((r) => r.json()); } catch (e) { S.scenes = []; }`, 'load scenes index');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
