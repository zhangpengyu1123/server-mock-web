#!/usr/bin/env node
/* 运行审计：状态码分布 + 延迟条形 + P95 + 命中统计 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
const lines = readFileSync(P, 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => /^  function viewAudit\(\) \{/.test(l));
if (start < 0) { console.log('MISS'); process.exit(1); }
let end = start;
while (end < lines.length && !/^  \/\* -+ \u89c6\u56fe/.test(lines[end]) && !/^  function viewElements/.test(lines[end])) end++;
while (end > start && lines[end].trim() === '') end--;

const fn = `  function viewAudit() {
    const rows = Array.isArray(S.audit) ? S.audit : [];
    const tfmt = (ms) => {
      if (!ms) return '—';
      const d = new Date(Number(ms));
      return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    };
    // 统计：状态码分桶 / 延迟 / P95
    const bucket = (s) => (s === 202 ? 'HUMAN' : s >= 500 ? '5xx' : s >= 400 ? '4xx' : s >= 300 ? '3xx' : '2xx');
    const counts = { '2xx': 0, '3xx': 0, '4xx': '0', '5xx': 0, HUMAN: 0 };
    rows.forEach((r) => { counts[bucket(Number(r.status))] = (counts[bucket(Number(r.status))] || 0) + 1; });
    const maxCount = Math.max(1, ...Object.values(counts).map((v) => Number(v) || 0));
    const delays = rows.map((r) => Number(r.delay_ms) || 0).sort((a, b) => a - b);
    const p95 = delays.length ? delays[Math.min(delays.length - 1, Math.floor(delays.length * 0.95))] : 0;
    const avg = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
    const maxDelay = Math.max(1, ...delays);
    const series = rows.slice(0, 40).reverse();

    const kv = (label, val, tone) => \`<div style="flex:1;min-width:88px">
        <div class="pl-muted" style="font-size:8px;letter-spacing:.18em">\${label}</div>
        <div style="font:600 18px/1.2 'JetBrains Mono',monospace;color:\${tone || 'var(--ink)'};margin-top:4px">\${val}</div>
      </div>\`;

    return head('运行审计', 'Request / response trail · human-pending gate', 'FILE NO. MOCK-003') + \`
      <div class="pl-card">
        <div class="pl-card__t">概览</div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;padding:2px 0 4px">
          \${kv('HITS', rows.length)}
          \${kv('AVG DELAY', avg + ' ms')}
          \${kv('P95', p95 + ' ms', p95 > 500 ? 'var(--danger)' : 'var(--ink)')}
          \${kv('HUMAN', rows.filter((r) => r.human).length, 'var(--signal)')}
          \${kv('ERRORS', rows.filter((r) => Number(r.status) >= 400).length, rows.some((r) => Number(r.status) >= 400) ? 'var(--danger)' : 'var(--ink)')}
        </div>
      </div>

      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">状态码分布</div>
          \${Object.entries(counts).map(([k, v]) => \`
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
              <div class="pl-mono" style="font-size:9px;width:46px;color:var(--ink-3)">\${k}</div>
              <div style="flex:1;height:9px;background:rgba(23,23,19,.06)">
                <i style="display:block;height:9px;width:\${(Number(v) / maxCount) * 100}%;
                  background:\${k === '5xx' ? 'var(--danger)' : k === '4xx' ? '#a0703c' : k === 'HUMAN' ? 'var(--signal)' : 'var(--ink)'}"></i>
              </div>
              <div class="pl-mono num" style="font-size:9.5px;width:26px;text-align:right">\${Number(v) || 0}</div>
            </div>\`).join('')}
        </div>

        <div class="pl-card">
          <div class="pl-card__t">延迟（最近 \${series.length} 次）</div>
          <svg viewBox="0 0 320 74" preserveAspectRatio="none" style="width:100%;height:74px;display:block">
            <line x1="0" y1="72" x2="320" y2="72" stroke="rgba(23,23,19,.18)"/>
            \${series.map((r, i) => {
              const d = Number(r.delay_ms) || 0;
              const h = Math.max(1.5, (d / maxDelay) * 64);
              const w = 320 / Math.max(series.length, 1) - 2;
              return \`<rect x="\${i * (320 / Math.max(series.length, 1))}" y="\${72 - h}" width="\${Math.max(2, w)}" height="\${h}"
                fill="\${Number(r.status) >= 400 ? 'var(--danger)' : r.human ? 'var(--signal)' : 'var(--ink)'}" opacity=".82"/>\`;
            }).join('')}
          </svg>
          <div class="pl-muted" style="font-size:8px;letter-spacing:.14em;margin-top:4px">BAR = DELAY MS · 深=成功 琥珀=人机 红=错误</div>
        </div>
      </div>

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
            <td>\${r.human ? \\\`<span class="pl-tag pl-tag--on">HUMAN 202</span>
              <button class="pl-btn pl-btn--sm" data-human-resolve="\${esc(r.mapping_id || '')}" style="margin-left:6px">确认</button>\\\` : '<span class="pl-muted">—</span>'}</td>
          </tr>\`).join('')}</tbody>
        </table>\` : \`<div class="pl-muted" style="padding:14px 0;font-size:10px">
          还没有请求记录。开一个 Mock 服务并打一次 <code>/mock/...</code>，这里会出现真实的请求与响应审计。
        </div>\`}
      </div>\`;
  }
`;
const out = [...lines.slice(0, start), ...fn.split('\n'), ...lines.slice(end + 1)];
writeFileSync(P, out.join('\n'), 'utf8');
console.log('ok   viewAudit 重写（含图表）');
