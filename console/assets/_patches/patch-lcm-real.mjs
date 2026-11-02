#!/usr/bin/env node
/* LCM：软件包登记真表单 + 共部署真开关（PATCH /platform），去掉本地假数据 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① 状态：pkgDraft */
const si = lines.findIndex((l) => l.includes("accSel: 0,"));
if (si >= 0) {
  lines.splice(si + 1, 0, "    pkgDraft: { name: '', kind: '网元软件包', owner: '', vendor: '', version: '' },");
  log.push('ok   状态 pkgDraft');
}

/* ② 视图：把「＋ 登记软件包」按钮换成表单块 */
const bi = lines.findIndex((l) => l.includes('id="btnPkgAdd"'));
if (bi >= 0) {
  const form = readFileSync('console/assets/lcm-pkg-form.txt', 'utf8').replace(/\r/g, '').replace(/\n$/, '').split('\n');
  // 删除按钮所在行（整行）
  lines.splice(bi, 1, ...form);
  log.push('ok   表单替换按钮');
} else log.push('MISS btnPkgAdd');

/* ③ 事件：替换本地假 handler */
const hi = lines.findIndex((l) => l.includes("const pkgAdd = $('#btnPkgAdd');"));
if (hi >= 0) {
  let end = hi;
  while (end < lines.length && !lines[end].includes('});')) end++;
  const ev = String.raw`      // LCM · 软件包登记（真实写后端）
      const pkgDraftBind = (id, key) => {
        const el = $('#' + id);
        if (el) el.addEventListener('input', () => { S.pkgDraft[key] = el.value; });
        if (el && el.tagName === 'SELECT') el.addEventListener('change', () => { S.pkgDraft[key] = el.value; });
      };
      pkgDraftBind('pkgName', 'name');
      pkgDraftBind('pkgKind', 'kind');
      pkgDraftBind('pkgOwner', 'owner');
      pkgDraftBind('pkgVendor', 'vendor');
      pkgDraftBind('pkgVersion', 'version');
      if (!S.pkgDraft.owner && S.elements[0]) S.pkgDraft.owner = S.elements[0].id;
      const pkgSubmit = $('#btnPkgSubmit');
      if (pkgSubmit) pkgSubmit.addEventListener('click', async () => {
        const msg = $('#pkgMsg');
        const d = S.pkgDraft;
        if (!d.name.trim() || !d.version.trim()) { if (msg) msg.textContent = '包名与版本必填'; return; }
        try {
          await api('/api/business/packages', {
            method: 'POST', headers: headers(),
            body: JSON.stringify({ name: d.name.trim(), kind: d.kind, owner: d.owner || (S.elements[0] || {}).id, vendor: d.vendor.trim() || '—', version: d.version.trim() }),
          });
          await loadLcm();
          S.pkgDraft = { name: '', kind: d.kind, owner: d.owner, vendor: d.vendor, version: '' };
          if (msg) { msg.textContent = '已登记 ✓'; setTimeout(() => { const m = $('#pkgMsg'); if (m) m.textContent = ''; }, 2500); }
        } catch (e) { if (msg) msg.textContent = '登记失败：' + e.message; }
        render();
      });
      // LCM · 「软件包」按钮：预填所属网元
      $$('[data-pkg-for]').forEach((b) => b.addEventListener('click', () => {
        S.pkgDraft.owner = b.dataset.pkgFor; render();
      }));`.split('\n');
  lines.splice(hi, end - hi + 1, ...ev);
  log.push('ok   登记事件替换');
} else log.push('MISS pkgAdd handler');

/* ④ 共部署：改成 PATCH platform */
const ci = lines.findIndex((l) => l.includes("const co = $('#btnCoDeploy');"));
if (ci >= 0) {
  lines[ci] = "      const co = $('#btnCoDeploy');";
  lines[ci + 1] = "      if (co) co.addEventListener('click', async () => {";
  lines[ci + 2] = "          const next = !(S.platform ? !!S.platform.co_deploy : S.lcm.coDeploy);";
  lines[ci + 3] = "          try { S.platform = await api('/api/business/platform', { method: 'PATCH', headers: headers(), body: JSON.stringify({ co_deploy: next }) }); } catch (e) { console.warn(e); }";
  lines[ci + 4] = "          render();";
  lines[ci + 5] = "      });";
  log.push('ok   共部署真开关');
} else log.push('MISS coDeploy');

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
