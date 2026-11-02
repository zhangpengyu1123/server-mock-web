#!/usr/bin/env node
/* OMC：账号授权范围可视化编辑（按网元组/网元勾选 → 保存 accounts） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* ① 状态：当前编辑的账号索引 */
rep(`    scenes: [],         // 内置教学场景（./scenes/index.json）`,
    `    scenes: [],         // 内置教学场景（./scenes/index.json）
    accSel: 0,          // OMC 当前编辑授权的账号下标`, 'state accSel');

/* ② 账号表：加"授权"列与可点击行 */
rep(`            <table class="pl-table">
              <thead><tr><th>Account</th><th>Role</th><th>Scope</th></tr></thead>
              <tbody>\${accounts.map((a) => \`<tr>
                <td>\${esc(a.name)}</td><td>\${esc(a.role)}</td>
                <td class="pl-muted">\${(a.scope || []).length} 个网元</td></tr>\`).join('')}</tbody>
            </table>`,
`            <table class="pl-table">
              <thead><tr><th>Account</th><th>Role</th><th>Scope</th><th></th></tr></thead>
              <tbody>\${accounts.map((a, i) => \`<tr style="cursor:pointer\${S.accSel === i ? ';background:rgba(166,125,72,.08)' : ''}" data-acc-row="\${i}">
                <td>\${esc(a.name)}</td><td>\${esc(a.role)}</td>
                <td class="pl-muted">\${(a.scope || []).length} 个网元</td>
                <td style="text-align:right"><span class="pl-tag \${S.accSel === i ? 'pl-tag--on' : ''}">\${S.accSel === i ? '编辑中' : '授权'}</span></td></tr>\`).join('')}</tbody>
            </table>

            \${accounts[S.accSel] ? \`<div style="border:1px solid var(--line-2);padding:10px;margin-top:10px">
              <div class="pl-muted" style="font-size:8.5px;letter-spacing:.16em;margin-bottom:6px">
                授权范围 · \${esc(accounts[S.accSel].name)}（点选网元写入 scope）
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">
                \${S.elements.map((el) => {
                  const on = (accounts[S.accSel].scope || []).includes(el.id);
                  return \\\`<button class="pl-btn pl-btn--sm" data-acc-scope="\\\${esc(el.id)}"
                    style="\\\${on ? 'background:#171713;color:#eae5e1;border-color:#171713' : ''}">\\\${esc(el.name)}</button>\\\`;
                }).join('')}
              </div>
              <div class="pl-row-end" style="justify-content:flex-start;gap:8px">
                <button class="pl-btn pl-btn--sm" id="btnAccAll">全选纳管网元</button>
                <button class="pl-btn pl-btn--sm" id="btnAccNone">清空</button>
                <button class="pl-btn pl-btn--sm pl-btn--solid" id="btnAccSave">保存授权</button>
                <span class="pl-muted" id="accMsg" style="font-size:9px"></span>
              </div>
            </div>\` : ''}`, 'accounts table');

/* ③ 事件 */
rep(`    // OMC · 站点保存`,
`    // OMC · 账号授权
    $$('[data-acc-row]').forEach((row) => row.addEventListener('click', () => {
      S.accSel = Number(row.dataset.accRow);
      render();
    }));
    $$('[data-acc-scope]').forEach((b) => b.addEventListener('click', async () => {
      const cfg = S.platform || {};
      const accs = JSON.parse(JSON.stringify(cfg.accounts || S.omc.accounts || []));
      const a = accs[S.accSel];
      if (!a) return;
      a.scope = a.scope || [];
      const id = b.dataset.accScope;
      a.scope = a.scope.includes(id) ? a.scope.filter((x) => x !== id) : a.scope.concat([id]);
      cfg.accounts = accs;
      S.platform = cfg;
      render();
    }));
    const accAll = $('#btnAccAll');
    if (accAll) accAll.addEventListener('click', () => {
      const cfg = S.platform || {};
      const accs = JSON.parse(JSON.stringify(cfg.accounts || []));
      if (accs[S.accSel]) accs[S.accSel].scope = (S.elements || []).map((e) => e.id);
      cfg.accounts = accs; S.platform = cfg; render();
    });
    const accNone = $('#btnAccNone');
    if (accNone) accNone.addEventListener('click', () => {
      const cfg = S.platform || {};
      const accs = JSON.parse(JSON.stringify(cfg.accounts || []));
      if (accs[S.accSel]) accs[S.accSel].scope = [];
      cfg.accounts = accs; S.platform = cfg; render();
    });
    const accSave = $('#btnAccSave');
    if (accSave) accSave.addEventListener('click', async () => {
      const msg = $('#accMsg');
      try {
        S.platform = await api('/api/business/platform', {
          method: 'PATCH', headers: headers(),
          body: JSON.stringify({ accounts: (S.platform.accounts || []) }),
        });
        if (msg) msg.textContent = '已保存 ✓';
      } catch (e) { if (msg) msg.textContent = '保存失败：' + e.message; }
      render();
    });

    // OMC · 站点保存`, 'acc events');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
