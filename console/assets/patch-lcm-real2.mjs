#!/usr/bin/env node
/* LCM 真表单/真开关（精确文本替换，最小改动） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* ① 状态 */
rep(`    accSel: 0,          // OMC 当前编辑授权的账号下标`,
`    accSel: 0,          // OMC 当前编辑授权的账号下标
    pkgDraft: { name: '', kind: '网元软件包', owner: '', vendor: '', version: '' },`, 'state pkgDraft');

/* ② 视图：按钮 → 表单 */
const form = readFileSync('console/assets/lcm-pkg-form.txt', 'utf8').replace(/\r/g, '').replace(/\n$/, '');
rep(`            <div class="pl-row-end"><button class="pl-btn pl-btn--solid pl-btn--sm" id="btnPkgAdd">＋ 登记软件包</button></div>`,
    form, 'view form');

/* ③ 共部署：真开关 */
rep(`      if (co) co.addEventListener('click', () => { S.lcm.coDeploy = !S.lcm.coDeploy; render(); });`,
`      if (co) co.addEventListener('click', async () => {
        const next = !(S.platform ? !!S.platform.co_deploy : S.lcm.coDeploy);
        try {
          S.platform = await api('/api/business/platform', {
            method: 'PATCH', headers: headers(), body: JSON.stringify({ co_deploy: next }),
          });
        } catch (e) { console.warn(e); }
        render();
      });`, 'coDeploy real');

/* ④ 登记：真 POST */
rep(`      const pkgAdd = $('#btnPkgAdd');
      if (pkgAdd) pkgAdd.addEventListener('click', () => {
        S.lcm.packages.push({ id: 'pkg-00' + (S.lcm.packages.length + 1), name: 'NR-RAN', kind: '网元软件包', owner: 'ne-0001', vendor: '华为', version: '5.2.2', verified: true });
        render();
      });`,
`      // LCM · 软件包登记（写后端）
      const draftBind = (id, key, isSelect) => {
        const el = $('#' + id);
        if (!el) return;
        const ev = isSelect ? 'change' : 'input';
        el.addEventListener(ev, () => { S.pkgDraft[key] = el.value; });
      };
      draftBind('pkgName', 'name');
      draftBind('pkgKind', 'kind', true);
      draftBind('pkgOwner', 'owner', true);
      draftBind('pkgVendor', 'vendor');
      draftBind('pkgVersion', 'version');
      if (!S.pkgDraft.owner && S.elements[0]) S.pkgDraft.owner = S.elements[0].id;
      const pkgSubmit = $('#btnPkgSubmit');
      if (pkgSubmit) pkgSubmit.addEventListener('click', async () => {
        const msg = $('#pkgMsg');
        const d = S.pkgDraft;
        if (!d.name.trim() || !d.version.trim()) { if (msg) msg.textContent = '包名与版本必填'; return; }
        try {
          await api('/api/business/packages', {
            method: 'POST', headers: headers(),
            body: JSON.stringify({
              name: d.name.trim(), kind: d.kind,
              owner: d.owner || (S.elements[0] || {}).id,
              vendor: d.vendor.trim() || '—', version: d.version.trim(),
            }),
          });
          await loadLcm();
          S.pkgDraft = { name: '', kind: d.kind, owner: d.owner, vendor: d.vendor, version: '' };
          if (msg) { msg.textContent = '已登记 ✓'; }
        } catch (e) { if (msg) msg.textContent = '登记失败：' + e.message; }
        render();
      });
      // 「软件包」按钮：预填所属网元
      $$('[data-pkg-for]').forEach((b) => b.addEventListener('click', () => {
        S.pkgDraft.owner = b.dataset.pkgFor;
        render();
      }));`, 'pkg submit real');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
