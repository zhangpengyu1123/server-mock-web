#!/usr/bin/env node
/* 重写 viewOmc（补三元 else、用真实任务字段），避免 PowerShell 插值破坏模板字符串 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');

const start = t.indexOf('  function viewOmc() {');
const end = t.indexOf('  /* ---------------------------------------------------------------- 视图：LCM */');
if (start < 0 || end < 0) { console.log('MISS viewOmc 区间'); process.exit(1); }

const fn = `  function viewOmc() {
    const o = S.omc;
    const ST = { done: '已完成', running: '进行中', pending: '待执行', failed: '失败', held: '已挂起' };
    return head('OMC 平台', 'Managed elements · accounts · integrated upgrade task with site', 'FILE NO. OMC-001') + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">纳管范围</div>
          <dl class="pl-kv">
            <dt>网元</dt><dd>\${o.elements.map((id) => esc((S.elements.find((e) => e.id === id) || {}).name || id)).join(' · ')}</dd>
            <dt>网元组</dt><dd>\${o.groups.map((g) => esc((S.groups.find((x) => x.id === g) || {}).name || g)).join(' · ')}</dd>
            <dt>站点</dt><dd>\${esc(S.site.name)} · \${esc(S.site.role)}</dd>
          </dl>
          <div class="pl-card__t" style="margin-top:14px">账号（按网元范围授权）</div>
          <table class="pl-table">
            <thead><tr><th>Account</th><th>Role</th><th>Scope</th></tr></thead>
            <tbody>\${o.accounts.map((a) => \`<tr><td>\${esc(a.name)}</td><td>\${esc(a.role)}</td>
              <td class="pl-muted">\${a.scope.length} 个网元</td></tr>\`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnAccAdd">＋ 创建账号</button></div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">一体化升级任务（点击进入时间线）</div>
          \${S.tasks.length ? S.tasks.map((k) => {
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
              <div class="pl-muted" style="font-size:8.5px;margin-top:6px">
                进度 \${k.progress}%\${pending ? ' · 卡在人工确认' : ''}
              </div>
            </div>\`;
          }).join('') : '<div class="pl-muted" style="font-size:10px;padding:6px 0">还没有任务，点下面创建。</div>'}
          <div class="pl-row-end">
            <button class="pl-btn pl-btn--solid pl-btn--sm" id="btnTaskAdd">＋ 创建升级任务</button>
          </div>
        </div>
      </div>\`;
  }

`;
t = t.slice(0, start) + fn + t.slice(end);

// 让 OMC 的"创建升级任务"走真实 API
t = t.replace(`    const taskAdd = $('#btnTaskAdd');
    if (taskAdd) taskAdd.addEventListener('click', () => {
      S.omc.tasks.push({ id: 'UPG-00' + (92 + S.omc.tasks.length), site: S.site.id, elements: ['ne-0001'], from: '5.2.1', to: '5.2.2', stage: 'upload', progress: 8, human: 0 });
      render();
    });`,
`    const taskAdd = $('#btnTaskAdd');
    if (taskAdd) taskAdd.addEventListener('click', async () => {
      try {
        const t3 = await api('/api/business/tasks', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ site: 'site-hz', element_ids: ['ne-0001', 'ne-0002'], from_version: '5.2.0', to_version: '5.2.1' }),
        });
        S.tasks.unshift(t3);
        S.taskSel = t3.id;
        S.view = 'task';
      } catch (e) { console.warn(e); }
      render();
    });`);

writeFileSync(P, t, 'utf8');
console.log('ok   viewOmc 重写 + 创建任务接 API');
