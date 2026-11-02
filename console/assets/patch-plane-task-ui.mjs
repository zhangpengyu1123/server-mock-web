#!/usr/bin/env node
/* 升级任务时间线 UI：竖排阶段 + 人机交互卡片（选项直接提交后端）+ OMC 列表接真实任务 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 状态 */
rep(`    ep: null,          // 当前 Mock 端点（来自后端）`,
    `    ep: null,          // 当前 Mock 端点（来自后端）
    tasks: [],         // 升级任务（来自后端）
    taskSel: null,     // 当前查看的任务 id`, 'state tasks');

/* 2) 载入任务 */
rep(`  /** 拉取端点（没有就建一个） */`,
`  async function loadTasks() {
    try { S.tasks = await api('/api/business/tasks') || []; } catch (e) { S.tasks = []; }
    return S.tasks;
  }

  /** 拉取端点（没有就建一个） */`, 'loadTasks');

/* 3) 视图：任务时间线 */
const VIEW = `
  /* ---------------------------------------------------------------- 视图：升级任务时间线 */
  function viewTask() {
    const t2 = S.tasks.find((x) => x.id === S.taskSel) || S.tasks[0];
    if (!t2) {
      return head('升级任务', 'Integrated upgrade · stages · human-in-the-loop', 'FILE NO. UPG') + \`
        <div class="pl-card"><div class="pl-muted" style="font-size:10px;padding:10px 0">
          还没有升级任务。到「OMC 平台」点「创建升级任务」，或在下面直接建一个。
        </div>
        <div class="pl-row-end"><button class="pl-btn pl-btn--solid pl-btn--sm" id="btnTaskQuick">＋ 创建升级任务</button></div></div>\`;
    }
    const ST = { done: '已完成', running: '进行中', pending: '待执行', failed: '失败', held: '已挂起' };
    const pendingHuman = t2.stages.find((s) => s.human && s.human.state === 'pending' && s.state === 'running');
    return head('升级任务 · ' + t2.id, 'Stage timeline · human-in-the-loop state machine', 'FILE NO. ' + t2.id) + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">阶段时间线</div>
          <div style="position:relative;padding-left:20px">
            <div style="position:absolute;left:5px;top:6px;bottom:6px;width:1px;background:var(--line-2)"></div>
            \${t2.stages.map((s, i) => \`
              <div style="position:relative;padding:0 0 18px 6px">
                <div style="position:absolute;left:-19px;top:5px;width:9px;height:9px;background:\${
                  s.state === 'done' ? 'var(--signal)' : s.state === 'running' ? 'var(--ink)' : s.state === 'failed' ? '#7d2f22' : 'var(--line-2)'
                }"></div>
                <div style="display:flex;justify-content:space-between;align-items:baseline">
                  <b style="font-size:11.5px">\${i + 1}. \${esc(s.label)}</b>
                  <span class="pl-tag \${
                    s.state === 'done' ? 'pl-tag--on' : s.state === 'failed' ? 'pl-tag--bad' : ''
                  }">\${esc(ST[s.state] || s.state)}</span>
                </div>
                \${s.human ? \`<div class="pl-muted" style="font-size:8.5px;margin-top:3px">
                  人机交互 · \${esc(s.human.state)} · 超时 \${s.human.timeout_s}s
                </div>\` : ''}
              </div>\`).join('')}
          </div>
          <div style="height:2px;background:var(--line-2);margin-top:4px">
            <i style="display:block;height:2px;width:\${t2.progress}%;background:var(--signal)"></i>
          </div>
          <div class="pl-muted" style="font-size:8.5px;margin-top:6px">进度 \${t2.progress}% · v\${esc(t2.from_version)} → v\${esc(t2.to_version)} · 站点 \${esc(t2.site)} · 网元 \${t2.element_ids.length} 个</div>
        </div>

        <div class="pl-card">
          <div class="pl-card__t">人工确认（Human-in-the-loop）</div>
          \${pendingHuman ? \`
            <div style="border:1px solid var(--signal);padding:12px;background:rgba(166,125,72,.06)">
              <div style="font-size:8.5px;letter-spacing:.2em;color:#8a6a3c">\${esc(pendingHuman.key.toUpperCase())} · PENDING</div>
              <div style="margin:8px 0 10px;font-size:11.5px;line-height:1.8">\${esc(pendingHuman.human.prompt)}</div>
              <div style="display:grid;gap:7px">
                \${pendingHuman.human.options.map((o, oi) => \`<button class="pl-human__opt" data-human-opt="\${oi}">
                  <span>\${esc(o.label)}</span><small>EFFECT · \${esc(o.effect)}</small></button>\`).join('')}
              </div>
              <div class="pl-muted" style="margin-top:8px;font-size:8px">提交后会真正推进任务阶段（continue）或挂起/终止</div>
            </div>\` : \`<div class="pl-muted" style="font-size:10px;padding:8px 0">当前没有待确认的人机交互节点。</div>\`}
          <div class="pl-card__t" style="margin-top:14px">所有任务</div>
          <table class="pl-table"><tbody>
            \${S.tasks.map((x) => \`<tr>
              <td>\${esc(x.id)}</td>
              <td class="pl-muted">\${esc(x.stages[x.stage] ? x.stages[x.stage].key : '—')}</td>
              <td class="num">\${x.progress}%</td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-task="\${esc(x.id)}">查看</button></td>
            </tr>\`).join('')}
          </tbody></table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnTaskQuick">＋ 创建升级任务</button></div>
        </div>
      </div>\`;
  }
`;
rep(`  /* ---------------------------------------------------------------- 视图：接口规则编辑器 */`, VIEW + `\n  /* ---------------------------------------------------------------- 视图：接口规则编辑器 */`, 'insert task view');

/* 4) 路由 */
rep(`    'iface': viewIface,`, `    'iface': viewIface,
    'task': viewTask,`, 'route task');

/* 5) OMC 任务卡片 → 打开时间线（用真实任务数据） */
rep(`          \${o.tasks.map((k) => \`<div style="border:1px solid var(--line);padding:10px;margin-bottom:10px">`,
    `          \${S.tasks.length ? S.tasks.map((k) => \`<div style="border:1px solid var(--line);padding:10px;margin-bottom:10px;cursor:pointer" data-task="\${esc(k.id)}">`,
    'omc tasks real');
rep(`              <div class="pl-muted" style="font-size:9px;margin:6px 0">站点 \${esc(S.site.name)} · 网元 \${k.elements.length} 个 · v\${esc(k.from)} → v\${esc(k.to)}</div>`,
    `              <div class="pl-muted" style="font-size:9px;margin:6px 0">站点 \${esc(k.site)} · 网元 \${k.element_ids.length} 个 · v\${esc(k.from_version)} → v\${esc(k.to_version)}</div>`,
    'omc task meta');
rep(`              <span class="pl-tag \${k.human ? 'pl-tag--on' : ''}">\${esc(k.stage)}</span>`,
    `              <span class="pl-tag \${k.stages[k.stage] && k.stages[k.stage].human ? 'pl-tag--on' : ''}">\${esc(k.stages[k.stage] ? k.stages[k.stage].key : '—')}</span>`,
    'omc task chip');
rep(`          \`).join('')}
          <div class="pl-row-end">
            <button class="pl-btn pl-btn--sm" id="btnTaskHuman">查看人工确认</button>`,
    `          \`).join('') : '<div class="pl-muted" style="font-size:10px;padding:6px 0">还没有任务，点下面创建。</div>'}
          <div class="pl-row-end">
            <button class="pl-btn pl-btn--sm" id="btnTaskHuman">查看人工确认</button>`,
    'omc tasks empty state');

/* 6) 事件：打开任务 / 提交人工确认 / 快速创建 */
rep(`    // 平台页`,
`    // 升级任务
    $$('[data-task]').forEach((b) => b.addEventListener('click', () => {
      S.taskSel = b.dataset.task; S.view = 'task'; render();
    }));
    $$('[data-human-opt]').forEach((b) => b.addEventListener('click', async () => {
      const task = S.tasks.find((x) => x.id === S.taskSel) || S.tasks[0];
      if (!task) return;
      try {
        const up = await api('/api/business/tasks/' + task.id + '/human', {
          method: 'POST', headers: headers(), body: JSON.stringify({ option: +b.dataset.humanOpt }),
        });
        S.tasks = S.tasks.map((x) => (x.id === up.id ? up : x));
      } catch (e) { console.warn(e); }
      render();
    }));
    const quick = $('#btnTaskQuick');
    if (quick) quick.addEventListener('click', async () => {
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
    });

    // 平台页`, 'bind tasks');

/* 7) 启动时载入任务 */
rep(`      if (ok) await loadEndpoint();`, `      if (ok) { await loadEndpoint(); await loadTasks(); }`, 'startup tasks');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
