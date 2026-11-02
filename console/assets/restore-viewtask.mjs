#!/usr/bin/env node
/* 补回被误删的 viewTask（含内联人工确认） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
if (t.includes('function viewTask()')) { console.log('已存在，跳过'); process.exit(0); }

const anchor = t.indexOf('  /* ---------------------------------------------------------------- 视图：人机交互状态机 */');
if (anchor < 0) { console.log('MISS anchor'); process.exit(1); }

const fn = `  function viewTask() {
    const t2 = S.tasks.find((x) => x.id === S.taskSel) || S.tasks[0];
    if (!t2) {
      return head('升级任务', 'Integrated upgrade · stages · human-in-the-loop', 'FILE NO. UPG') + \`
        <div class="pl-card"><div class="pl-muted" style="font-size:10px;padding:10px 0">
          还没有升级任务。到「OMC 平台」或「LCM 平台」发起一次升级，或在下面直接建一个。
        </div>
        <div class="pl-row-end"><button class="pl-btn pl-btn--solid pl-btn--sm" id="btnTaskQuick">＋ 创建升级任务</button></div></div>\`;
    }
    const ST = { done: '已完成', running: '进行中', pending: '待执行', failed: '失败', held: '已挂起' };
    const nodeColor = (st) => st === 'done' ? 'var(--signal)' : st === 'running' ? 'var(--ink)' : st === 'failed' ? '#7d2f22' : st === 'held' ? '#a67d48' : 'var(--line-2)';
    const pendingIdx = t2.stages.findIndex((st) => st.human && st.human.state === 'pending');
    return head('升级任务 · ' + t2.id, 'Stage timeline · human-in-the-loop state machine', 'FILE NO. ' + t2.id) + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">阶段时间线（人工确认内联在阶段里）</div>
          <div style="position:relative;padding-left:22px">
            <div style="position:absolute;left:5px;top:8px;bottom:8px;width:1px;background:var(--line-2)"></div>
            \${t2.stages.map((st, i) => \`
              <div style="position:relative;padding:0 0 16px 8px">
                <div style="position:absolute;left:-21px;top:4px;width:9px;height:9px;background:\${nodeColor(st.state)}"></div>
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
                  <b style="font-size:11.5px">\${i + 1}. \${esc(st.label)}</b>
                  <span class="pl-tag \${st.state === 'done' ? 'pl-tag--on' : st.state === 'failed' ? 'pl-tag--bad' : ''}">\${esc(ST[st.state] || st.state)}</span>
                </div>
                \${st.human && st.human.state === 'pending' && st.state === 'running' ? \`
                  <div style="border:1px solid var(--signal);background:rgba(166,125,72,.07);padding:11px;margin-top:8px">
                    <div style="font-size:8px;letter-spacing:.2em;color:#8a6a3c">HUMAN · PENDING · 超时 \${st.human.timeout_s}s</div>
                    <div style="margin:7px 0 9px;font-size:11px;line-height:1.75">\${esc(st.human.prompt)}</div>
                    <div style="display:grid;gap:6px">
                      \${st.human.options.map((o, oi) => \`<button class="pl-human__opt" data-human-opt="\${oi}">
                        <span>\${esc(o.label)}</span><small>EFFECT · \${esc(o.effect)}</small></button>\`).join('')}
                    </div>
                  </div>\` : ''}
                \${st.human && st.human.state !== 'pending' ? \`
                  <div class="pl-muted" style="font-size:8.5px;margin-top:4px">
                    人机交互 · \${esc(st.human.state)}\${st.human.chosen !== undefined && st.human.chosen !== null ? ' · 选择第 ' + (st.human.chosen + 1) + ' 项' : ''}
                  </div>\` : ''}
              </div>\`).join('')}
          </div>
          <div style="height:2px;background:var(--line-2);margin-top:2px">
            <i style="display:block;height:2px;width:\${t2.progress}%;background:var(--signal);transition:width .3s ease"></i>
          </div>
          <div class="pl-muted" style="font-size:8.5px;margin-top:6px">
            进度 \${t2.progress}% · v\${esc(t2.from_version)} → v\${esc(t2.to_version)} · 站点 \${esc(t2.site)} · 网元 \${t2.element_ids.length} 个
            \${pendingIdx >= 0 ? ' · 卡在第 ' + (pendingIdx + 1) + ' 段待确认' : ''}
          </div>
        </div>

        <div class="pl-card">
          <div class="pl-card__t">任务摘要</div>
          <dl class="pl-kv">
            <dt>Task</dt><dd>\${esc(t2.id)}</dd>
            <dt>Site</dt><dd>\${esc(t2.site)}</dd>
            <dt>Elements</dt><dd>\${t2.element_ids.length} 个</dd>
            <dt>Version</dt><dd>v\${esc(t2.from_version)} → v\${esc(t2.to_version)}</dd>
            <dt>Stage</dt><dd>\${(t2.stage || 0) + 1} / \${t2.stages.length}</dd>
            <dt>Human</dt><dd>\${pendingIdx >= 0 ? '<span class="pl-tag pl-tag--on">PENDING</span>' : '<span class="pl-muted">无待确认</span>'}</dd>
          </dl>
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
t = t.slice(0, anchor) + fn + t.slice(anchor);
writeFileSync(P, t, 'utf8');
console.log('ok   viewTask 已补回');
