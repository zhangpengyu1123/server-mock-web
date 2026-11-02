#!/usr/bin/env node
/* 接口规则编辑器接后端：列表来自 /api/business/mappings，规则 PATCH 到 /rules */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 载入接口（真实 mappings，映射成编辑器的数据形状） */
rep(`  async function loadTasks() {`,
`  async function loadIfaces() {
    try {
      const list = await api('/api/business/mappings') || [];
      S.ifaces = list.map((m) => ({
        id: m.id,
        method: String(m.method || 'get').toUpperCase(),
        path: m.path,
        status: m.status,
        delay: m.delay_ms,
        rules: (m.fields || []).length,
        human: m.human ? 1 : 0,
        raw: m,
      }));
      list.forEach((m) => {
        S.ifaceRules[m.id] = {
          status: m.status,
          delay: m.delay_ms,
          fields: (m.fields || []).map((f) => ({
            name: f.name, type: f.kind, src: f.source, value: f.value,
            step: f.step, max: f.max, condition: f.condition,
          })),
          human: m.human ? [{
            step: '人工确认',
            prompt: m.human.prompt,
            timeout: 60,
            state: String(m.human.state || 'pending').toUpperCase(),
            options: (m.human.options || []).map((o) => ({ l: o.label, effect: o.effect, set: '—' })),
          }] : [],
          raw: m,
        };
      });
      if (!S.ifaces.find((x) => x.id === S.ifaceSel) && S.ifaces.length) S.ifaceSel = S.ifaces[0].id;
    } catch (e) { /* 离线时保留本地演示数据 */ }
    return S.ifaces;
  }

  async function loadTasks() {`, 'loadIfaces');

/* 2) 保存按钮：把编辑器状态 PATCH 回后端 */
rep(`      <div class="pl-row-end" style="margin-top:14px">
        <button class="pl-btn" id="ifBack">返回接口列表</button>
      </div>\`;`,
`      <div class="pl-row-end" style="margin-top:14px">
        <span class="pl-muted" id="ifSaveMsg" style="margin-right:auto;font-size:9px"></span>
        <button class="pl-btn" id="ifBack">返回接口列表</button>
        <button class="pl-btn pl-btn--solid" id="ifSave">保存规则</button>
      </div>\`;`, 'save button');

/* 3) 事件：保存 */
rep(`    const ifBack = $('#ifBack');`,
`    const ifSave = $('#ifSave');
    if (ifSave) ifSave.addEventListener('click', async () => {
      const r = S.ifaceRules[S.ifaceSel];
      if (!r) return;
      const msg = $('#ifSaveMsg');
      try {
        await api('/api/business/mappings/' + S.ifaceSel, {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ status: r.status, delay_ms: r.delay }),
        });
        await api('/api/business/mappings/' + S.ifaceSel + '/rules', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({
            fields: r.fields.map((f) => ({
              name: f.name, kind: f.type, source: f.src, value: f.value || '',
              step: f.step || 1, max: f.max || 0, condition: f.value || '',
            })),
            human: r.human.length ? {
              prompt: r.human[0].prompt,
              options: r.human[0].options.map((o) => ({ label: o.l, effect: o.effect })),
              state: String(r.human[0].state || 'PENDING').toLowerCase(),
            } : null,
            clear_human: r.human.length === 0,
          }),
        });
        if (msg) { msg.textContent = '已保存到服务端 ✓'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2200); }
        await loadIfaces();
      } catch (e) {
        if (msg) msg.textContent = '保存失败：' + e.message;
      }
    });
    const ifBack = $('#ifBack');`, 'bind save');

/* 4) 启动载入接口 */
rep(`      if (ok) { await loadEndpoint(); await loadTasks(); }`,
    `      if (ok) { await loadEndpoint(); await loadTasks(); await loadIfaces(); }`, 'startup ifaces');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
