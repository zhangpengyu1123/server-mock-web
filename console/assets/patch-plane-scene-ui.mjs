#!/usr/bin/env node
/* 导出/导入 场景：MOCK 管理页底部按钮（下载 JSON / 选择文件导入） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 视图：在 MOCK 管理页尾部加"场景"卡片（用唯一的：端点状态卡之后） */
rep(`      <div class="pl-card">
        <div class="pl-card__t">端点状态（服务端）</div>`,
`      <div class="pl-card">
        <div class="pl-card__t">场景快照（导出 / 导入）</div>
        <div class="pl-muted" style="font-size:10px;line-height:1.8;margin-bottom:10px">
          把端点、网元、网元组、软件包、平台配置、人机模板、MOCK 规则打包成一个 JSON。换机器演示时导入即可。
        </div>
        <div class="pl-row-end" style="justify-content:flex-start;gap:8px">
          <button class="pl-btn pl-btn--sm" id="btnSceneExport">↓ 导出场景</button>
          <button class="pl-btn pl-btn--sm" id="btnSceneImport">↑ 导入场景</button>
          <input type="file" id="sceneFile" accept="application/json" style="display:none"/>
          <span class="pl-muted" id="sceneMsg" style="font-size:9px"></span>
        </div>
      </div>

      <div class="pl-card">
        <div class="pl-card__t">端点状态（服务端）</div>`, 'scene card');

/* 事件：插在 MOCK 管理页的绑定区（用唯一 anchor：data-cap 绑定之后的块前） */
rep(`    // 审计：确认人机交互（放行 202）`,
`    // 场景导出 / 导入
    const sceneExport = $('#btnSceneExport');
    if (sceneExport) sceneExport.addEventListener('click', async () => {
      const msg = $('#sceneMsg');
      try {
        const scene = await api('/api/business/export');
        const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'rhine-scene-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        if (msg) { msg.textContent = '已导出 ✓'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2500); }
      } catch (e) { if (msg) msg.textContent = '导出失败：' + e.message; }
    });
    const sceneImportBtn = $('#btnSceneImport');
    const sceneFile = $('#sceneFile');
    if (sceneImportBtn && sceneFile) {
      sceneImportBtn.addEventListener('click', () => sceneFile.click());
      sceneFile.addEventListener('change', async () => {
        const msg = $('#sceneMsg');
        const f = sceneFile.files && sceneFile.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          const payload = JSON.parse(text);
          const res = await api('/api/business/import', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
          await Promise.all([loadEndpoint(), loadElements(), loadLcm(), loadHuman(), loadTasks(), loadIfaces()]);
          if (msg) { msg.textContent = '已导入 ' + (res.imported || 0) + ' 条 ✓'; setTimeout(() => { if (msg) msg.textContent = ''; }, 3000); }
        } catch (e) { if (msg) msg.textContent = '导入失败：' + e.message; }
        render();
      });
    }

    // 审计：确认人机交互（放行 202）`, 'scene events');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
