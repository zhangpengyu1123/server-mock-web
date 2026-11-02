#!/usr/bin/env node
/* OMC 页接后端：纳管网元 chips + 账号表 + 创建账号 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 重写 viewOmc（用 S.platform） */
const s = t.indexOf('  function viewOmc() {');
const e = t.indexOf('  /* ---------------------------------------------------------------- 视图：LCM */');
if (s > 0 && e > s) {
  const fn = `  function viewOmc() {
    const ST = { done: '已完成', running: '进行中', pending: '待执行', failed: '失败', held: '已挂起' };
    const cfg = S.platform || { omc_elements: [], omc_groups: [], accounts: [] };
    const managed = cfg.omc_elements && cfg.omc_elements.length ? cfg.omc_elements : S.omc.elements;
    const accounts = cfg.accounts && cfg.accounts.length ? cfg.accounts : S.omc.accounts;
    return head('OMC 平台', 'Managed elements · accounts · integrated upgrade task with site', 'FILE NO. OMC-001') + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">纳管网元（点选切换，写回后端）</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
            \${S.elements.map((el) => \`<button class="pl-btn pl-btn--sm" data-omc-el="\${esc(el.id)}"
              style="\${managed.includes(el.id) ? 'background:#171713;color:#eae5e1;border-color:#171713' : ''}">\${esc(el.name)}</button>\`).join('')}
          </div>
          <dl class="pl-kv">
            <dt>纳管数量</dt><dd>\${managed.length} / \${S.elements.length}</dd>
            <dt>网元组</dt><dd>\${(cfg.omc_groups || []).length ? cfg.omc_groups.join(' · ') : '—'}</dd>
            <dt>站点</dt><dd>\${esc(S.site.name)} · \${esc(S.site.role)}</dd>
          </dl>
          <div class="pl-card__t" style="margin-top:14px">账号（按网元范围授权）</div>
          <table class="pl-table">
            <thead><tr><th>Account</th><th>Role</th><th>Scope</th></tr></thead>
            <tbody>\${accounts.map((a) => \`<tr>
              <td>\${esc(a.name)}</td><td>\${esc(a.role)}</td>
              <td class="pl-muted">\${(a.scope || []).length} 个网元</td></tr>\`).join('')}</tbody>
          </table>
          <div style="display:flex;gap:6px;margin-top:10px">
            <input id="accName" placeholder="账号名" style="flex:1;font:inherit;font-size:10px;padding:5px 7px;background:#fff;border:1px solid var(--line-2)"/>
            <select id="accRole" style="font:inherit;font-size:10px;padding:4px;background:#fff;border:1px solid var(--line-2)">
              <option>运维</option><option>只读</option><option>管理员</option>
            </select>
            <button class="pl-btn pl-btn--sm" id="btnAccAdd">创建账号</button>
          </div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">一体化升级任务（点击进入时间线）</div>
          \${S.tasks.length ? S.tasks.slice(0, 6).map((k) => {
            const cur = k.stages[k.stage] || {};
            const pending = cur.human && cur.human.state === 'pending';
            return \`<div style="border:1px solid var(--line);padding:10px;margin-bottom:10px;cursor:pointer" data-task="\${esc(k.id)}">
              <div style="display:flex;justify-content:space-between;align-items:baseline">
                <b style="font-size:11.5px">\${esc(k.id)}</b>
                <span class="pl-tag \${pending ? 'pl-tag--on' : ''}">\${esc(ST[cur.state] || cur.state || '—')}</span>
              </div>
              <div class="pl-muted" style="font-size:9px;margin:6px 0">
                站点 \${esc(k.site)} · 网元 \${k.element_ids.length} 个 · v\${esc(k.from_version)} → v\${esc(k.to_version)}
              </div>
              <div style="height:2px;background:var(--line-2)"><i style="display:block;height:2px;width:\${k.progress}%;background:var(--signal)"></i></div>
              <div class="pl-muted" style="font-size:8.5px;margin-top:6px">进度 \${k.progress}%\${pending ? ' · 卡在人工确认' : ''}</div>
            </div>\`;
          }).join('') : '<div class="pl-muted" style="font-size:10px;padding:6px 0">还没有任务，点下面创建。</div>'}
          <div class="pl-row-end">
            <button class="pl-btn pl-btn--solid pl-btn--sm" id="btnTaskAdd">＋ 创建升级任务</button>
          </div>
        </div>
      </div>\`;
  }

`;
  t = t.slice(0, s) + fn + t.slice(e);
  log.push('ok   viewOmc');
} else log.push('MISS viewOmc');

/* 事件：纳管切换 + 创建账号（插在 LCM 绑定前） */
rep(`    // LCM · 包升级 → 生成任务`,
`    // OMC · 纳管网元切换
    $$('[data-omc-el]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.omcEl;
      const cfg = S.platform || { omc_elements: [] };
      const cur = new Set(cfg.omc_elements || []);
      cur.has(id) ? cur.delete(id) : cur.add(id);
      try {
        S.platform = await api('/api/business/platform', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ omc_elements: [...cur] }),
        });
        S.omc.elements = S.platform.omc_elements || [...cur];
      } catch (e) { console.warn(e); }
      render();
    }));
    // OMC · 创建账号
    const accAdd = $('#btnAccAdd');
    if (accAdd) accAdd.addEventListener('click', async () => {
      const name = ($('#accName') || {}).value;
      if (!name || !name.trim()) return;
      const cfg = S.platform || { accounts: [] };
      const accounts = (cfg.accounts || []).slice();
      accounts.push({
        id: 'acc-' + String(accounts.length + 1).padStart(2, '0'),
        name: name.trim(),
        role: ($('#accRole') || {}).value || '只读',
        scope: (cfg.omc_elements || S.omc.elements || []).slice(0, 1),
      });
      try {
        S.platform = await api('/api/business/platform', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ accounts }),
        });
        S.omc.accounts = S.platform.accounts || accounts;
      } catch (e) { console.warn(e); }
      render();
    });

    // LCM · 包升级 → 生成任务`, 'bind omc');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
