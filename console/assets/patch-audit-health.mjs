#!/usr/bin/env node
/* 审计：接口健康度排行（按 path 聚合） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* ① 在 auditCharts 之前插入 auditHealth 辅助函数 */
rep(`  /** 审计图表 HTML（概览 / 状态码分布 / 延迟条形） */`,
`  /** 接口健康度：按 path 聚合命中 / 错误率 / 平均延迟 */
  function auditHealth(rows) {
    if (!rows.length) return '';
    const map = new Map();
    rows.forEach((r) => {
      const k = String(r.path || '—');
      const it = map.get(k) || { path: k, hits: 0, errors: 0, delays: [], lastStatus: 0, lastAt: 0 };
      it.hits++;
      const st = Number(r.status) || 0;
      if (st >= 400) it.errors++;
      it.delays.push(Number(r.delay_ms) || 0);
      if ((Number(r.at) || 0) >= it.lastAt) { it.lastAt = Number(r.at) || 0; it.lastStatus = st; }
      map.set(k, it);
    });
    const list = Array.from(map.values()).sort((a, b) => b.hits - a.hits).slice(0, 8);
    const body = list.map((it) => {
      const avg = Math.round(it.delays.reduce((a, b) => a + b, 0) / it.delays.length);
      const rate = Math.round((it.errors / it.hits) * 100);
      const tone = rate === 0 ? 'var(--ink)' : rate < 30 ? '#a0703c' : 'var(--danger)';
      return '<tr>'
        + '<td class="pl-mono" style="font-size:10px">' + esc(it.path) + '</td>'
        + '<td class="num">' + it.hits + '</td>'
        + '<td class="num" style="color:' + tone + ';font-weight:600">' + rate + '%</td>'
        + '<td class="num">' + avg + ' ms</td>'
        + '<td class="num">' + it.lastStatus + '</td>'
        + '</tr>';
    }).join('');
    return '<div class="pl-card"><div class="pl-card__t">接口健康度（按 path 聚合）</div>'
      + '<table class="pl-table"><thead><tr><th>Path</th><th>Hits</th><th>Err</th><th>Avg</th><th>Last</th></tr></thead>'
      + '<tbody>' + body + '</tbody></table></div>';
  }

  /** 审计图表 HTML（概览 / 状态码分布 / 延迟条形） */`, 'auditHealth fn');

/* ② 在 auditCharts 结尾拼上健康度（在最后一个 '</div></div>' 之后、return 结束前） */
rep(`      + '</div></div>';
  }

  function viewAudit() {`,
`      + '</div></div>'
      + auditHealth(rows);
  }

  function viewAudit() {`, 'append health');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
