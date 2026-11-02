#!/usr/bin/env node
/* 任务时间线：超时状态展示 + 「重新发起确认」按钮 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 过期状态卡片 */
rep(`                \${st.human && st.human.state !== 'pending' ? \``,
`                \${st.human && st.human.state === 'expired' ? \`
                  <div style="border:1px solid #7d2f22;background:rgba(125,47,34,.05);padding:11px;margin-top:8px">
                    <div style="font-size:8px;letter-spacing:.2em;color:#7d2f22">HUMAN · EXPIRED · 超时 \${st.human.timeout_s}s</div>
                    <div style="margin:7px 0 9px;font-size:11px;line-height:1.75">\${esc(st.human.prompt)}</div>
                    <button class="pl-btn pl-btn--sm" data-human-retry="\${esc(t2.id)}">重新发起确认</button>
                  </div>\` : ''}
                \${st.human && st.human.state !== 'pending' && st.human.state !== 'expired' ? \``, 'expired card');

/* 2) 状态中文映射补 held */
rep(`    const ST = { done: '已完成', running: '进行中', pending: '待执行', failed: '失败', held: '已挂起' };`,
    `    const ST = { done: '已完成', running: '进行中', pending: '待执行', failed: '失败', held: '已挂起（等人确认）' };`, 'st map');

/* 3) 事件：重新发起 */
rep(`    // OMC · 站点保存`,
`    // 任务 · 超时后重新发起人工确认
    $$('[data-human-retry]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api('/api/business/tasks/' + b.dataset.humanRetry + '/human/retry', {
          method: 'POST', headers: headers(), body: '{}',
        });
        await loadTasks();
      } catch (e) { console.warn(e); }
      render();
    }));

    // OMC · 站点保存`, 'retry binding');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
