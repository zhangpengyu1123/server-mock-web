#!/usr/bin/env node
/* 运行审计页接真实数据：GET /api/business/audit */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 状态 + 载入 */
rep(`  async function loadIfaces() {`,
`  async function loadAudit() {
    try { S.audit = await api('/api/business/audit?limit=60') || []; } catch (e) { S.audit = []; }
    return S.audit;
  }

  async function loadIfaces() {`, 'loadAudit');

/* 2) 审计视图：真实行 */
rep(`    const rows = S.audit.length ? S.audit : [];`,
    `    const rows = S.audit.length ? S.audit : [];`, 'rows anchor exists');

/* 替换整块 viewAudit 渲染（保留空态） */
const start = t.indexOf('  function viewAudit() {');
const end = t.indexOf('  /* ---------------------------------------------------------------- 视图：网元自定义 */');
if (start > 0 && end > start) {
  const fn = `  function viewAudit() {
    const rows = Array.isArray(S.audit) ? S.audit : [];
    const tfmt = (ms) => {
      if (!ms) return '—';
      const d = new Date(Number(ms));
      return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    };
    return head('运行审计', 'Request / response trail · human-pending gate', 'FILE NO. MOCK-003') + \`
      <div class="pl-card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
          <div class="pl-card__t" style="margin:0">请求与响应（最近 \${rows.length} 条，服务端记录）</div>
          <button class="pl-btn pl-btn--sm" id="btnAuditRefresh">刷新</button>
        </div>
        \${rows.length ? \`<table class="pl-table">
          <thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Delay</th><th>Human</th></tr></thead>
          <tbody>\${rows.map((r) => \`<tr>
            <td class="pl-muted pl-mono">\${tfmt(r.at)}</td>
            <td>\${esc(String(r.method || '').toUpperCase())}</td>
            <td>\${esc(r.path)}</td>
            <td class="num \${r.status >= 400 ? 'pl-tag--bad' : ''}">\${r.status}</td>
            <td class="num">\${r.delay_ms || 0} ms</td>
            <td>\${r.human ? '<span class="pl-tag pl-tag--on">HUMAN 202</span>' : '<span class="pl-muted">—</span>'}</td>
          </tr>\`).join('')}</tbody>
        </table>\` : \`<div class="pl-muted" style="padding:14px 0;font-size:10px">
          还没有请求记录。开一个 Mock 服务并打一次 <code>/mock/...</code>，这里会出现真实的请求与响应审计。
        </div>\`}
      </div>\`;
  }

`;
  t = t.slice(0, start) + fn + t.slice(end);
  log.push('ok   viewAudit 重写');
} else log.push('MISS viewAudit 区间');

/* 3) 事件：刷新 */
rep(`    // 升级任务`, `    // 审计
    const auditRefresh = $('#btnAuditRefresh');
    if (auditRefresh) auditRefresh.addEventListener('click', async () => { await loadAudit(); render(); });

    // 升级任务`, 'bind audit');

/* 4) 启动载入 */
rep(`      if (ok) { await loadEndpoint(); await loadTasks(); await loadIfaces(); }`,
    `      if (ok) { await loadEndpoint(); await loadTasks(); await loadIfaces(); await loadAudit(); }`, 'startup audit');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
