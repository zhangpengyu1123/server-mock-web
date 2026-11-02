#!/usr/bin/env node
/* 审计图表：新增辅助函数 auditStats()/auditCharts()，再在 viewAudit 里插入调用（小锚点，不动整块） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① 在 viewAudit 之前插入两个辅助函数 */
const at = lines.findIndex((l) => /^  function viewAudit\(\) \{/.test(l));
if (at < 0) { console.log('MISS viewAudit'); process.exit(1); }
const helpers = String.raw`  /** 审计统计：状态码分桶 / 延迟 / P95 */
  function auditStats(rows) {
    const bucket = (s) => (s === 202 ? 'HUMAN' : s >= 500 ? '5xx' : s >= 400 ? '4xx' : s >= 300 ? '3xx' : '2xx');
    const counts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, HUMAN: 0 };
    rows.forEach((r) => { const k = bucket(Number(r.status)); counts[k] = (counts[k] || 0) + 1; });
    const delays = rows.map((r) => Number(r.delay_ms) || 0).sort((a, b) => a - b);
    const p95 = delays.length ? delays[Math.min(delays.length - 1, Math.floor(delays.length * 0.95))] : 0;
    const avg = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
    const maxDelay = Math.max(1, ...delays);
    return { counts, p95, avg, maxDelay, series: rows.slice(0, 40).reverse() };
  }

  /** 审计图表 HTML（概览 / 状态码分布 / 延迟条形） */
  function auditCharts(rows) {
    if (!rows.length) return '';
    const st = auditStats(rows);
    const kv = (label, val, tone) => '<div style="flex:1;min-width:86px">'
      + '<div class="pl-muted" style="font-size:8px;letter-spacing:.18em">' + label + '</div>'
      + '<div style="font:600 18px/1.2 \'JetBrains Mono\',monospace;color:' + (tone || 'var(--ink)') + ';margin-top:4px">' + val + '</div></div>';
    const maxCount = Math.max(1, ...Object.values(st.counts));
    const bars = Object.keys(st.counts).map((k) => {
      const v = st.counts[k];
      const color = k === '5xx' ? 'var(--danger)' : k === '4xx' ? '#a0703c' : k === 'HUMAN' ? 'var(--signal)' : 'var(--ink)';
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">'
        + '<div class="pl-mono" style="font-size:9px;width:46px;color:var(--ink-3)">' + k + '</div>'
        + '<div style="flex:1;height:9px;background:rgba(23,23,19,.06)"><i style="display:block;height:9px;width:'
        + ((v / maxCount) * 100).toFixed(1) + '%;background:' + color + '"></i></div>'
        + '<div class="pl-mono num" style="font-size:9.5px;width:26px;text-align:right">' + v + '</div></div>';
    }).join('');
    const step = 320 / Math.max(st.series.length, 1);
    const rects = st.series.map((r, i) => {
      const d = Number(r.delay_ms) || 0;
      const h = Math.max(1.5, (d / st.maxDelay) * 64);
      const color = Number(r.status) >= 400 ? 'var(--danger)' : r.human ? 'var(--signal)' : 'var(--ink)';
      return '<rect x="' + (i * step).toFixed(1) + '" y="' + (72 - h).toFixed(1) + '" width="'
        + Math.max(2, step - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + color + '" opacity=".82"/>';
    }).join('');
    return '<div class="pl-card"><div class="pl-card__t">概览</div>'
      + '<div style="display:flex;gap:18px;flex-wrap:wrap;padding:2px 0 4px">'
      + kv('HITS', rows.length)
      + kv('AVG DELAY', st.avg + ' ms')
      + kv('P95', st.p95 + ' ms', st.p95 > 500 ? 'var(--danger)' : 'var(--ink)')
      + kv('HUMAN', rows.filter((r) => r.human).length, 'var(--signal)')
      + kv('ERRORS', rows.filter((r) => Number(r.status) >= 400).length, rows.some((r) => Number(r.status) >= 400) ? 'var(--danger)' : 'var(--ink)')
      + '</div></div>'
      + '<div class="pl-grid pl-grid--side">'
      + '<div class="pl-card"><div class="pl-card__t">状态码分布</div>' + bars + '</div>'
      + '<div class="pl-card"><div class="pl-card__t">延迟（最近 ' + st.series.length + ' 次）</div>'
      + '<svg viewBox="0 0 320 74" preserveAspectRatio="none" style="width:100%;height:74px;display:block">'
      + '<line x1="0" y1="72" x2="320" y2="72" stroke="rgba(23,23,19,.18)"/>' + rects + '</svg>'
      + '<div class="pl-muted" style="font-size:8px;letter-spacing:.14em;margin-top:4px">BAR = DELAY MS · 深=成功 琥珀=人机 红=错误</div>'
      + '</div></div>';
  }

`.split('\n');
lines = [...lines.slice(0, at), ...helpers, ...lines.slice(at)];
log.push('ok   辅助函数');

/* ② viewAudit 里在 head(...) 之后插入图表 */
const hi = lines.findIndex((l, i) => i > at && l.includes("head('运行审计'"));
if (hi < 0) { console.log('MISS head'); process.exit(1); }
// 找到 head(...) 表达式所在模板的 ` return ` 行
let ri = hi;
while (ri > at && !/^\s*return head\('运行审计'/.test(lines[ri])) ri--;
if (ri >= 0) {
  lines[ri] = lines[ri].replace("return head('运行审计', 'Request / response trail · human-pending gate', 'FILE NO. MOCK-003') + `", "return head('运行审计', 'Request / response trail · human-pending gate', 'FILE NO. MOCK-003') + auditCharts(rows) + `");
  log.push('ok   viewAudit 注入 auditCharts');
}

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
