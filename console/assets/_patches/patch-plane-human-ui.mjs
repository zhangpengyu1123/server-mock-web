#!/usr/bin/env node
/* 新增"人机交互"视图：状态机 SVG + 可编辑状态/操作结果 + 保存到后端 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 导航项（准备态） */
rep(`        { id: 'omc', t: 'OMC 平台', s: '纳管·账号·升级' },`,
`        { id: 'human', t: '人机交互', s: 'HUMAN-SM' },
        { id: 'omc', t: 'OMC 平台', s: '纳管·账号·升级' },`, 'nav human');

/* 2) 状态 + 载入 */
rep(`    platform: null,    // 平台配置（共部署 / FS）`,
`    platform: null,    // 平台配置（共部署 / FS）
    human: null,       // 人机交互模板（状态机）`, 'state human');

rep(`  async function loadLcm() {`,
`  async function loadHuman() {
    try { S.human = await api('/api/business/human-template'); } catch (e) { /* 离线 */ }
    return S.human;
  }

  async function loadLcm() {`, 'loadHuman');

/* 3) 视图 */
const VIEW = `
  /* ---------------------------------------------------------------- 视图：人机交互状态机 */
  function viewHuman() {
    const h = S.human || {
      states: [
        { id: 'PENDING', label: '待确认', tone: 'signal' },
        { id: 'RESOLVED', label: '已确认', tone: 'ink' },
        { id: 'EXPIRED', label: '已超时', tone: 'danger' },
        { id: 'SKIPPED', label: '已跳过', tone: 'muted' },
      ],
      outcomes: [
        { option: '确认继续', effect: 'continue', to: 'RESOLVED', set_field: 'humanResult=ok' },
        { option: '稍后处理', effect: 'hold', to: 'PENDING', set_field: 'humanResult=hold' },
        { option: '终止升级', effect: 'abort', to: 'EXPIRED', set_field: 'humanResult=abort' },
      ],
    };
    const toneColor = { signal: '#a67d48', ink: '#171713', danger: '#7d2f22', muted: '#8e897b' };
    const W = 760, H = 260;
    const p = h.states.find((s) => s.id === 'PENDING') || { id: 'PENDING' };
    const nodes = [
      { id: p.id, x: 90, y: 120, label: (h.states.find((s) => s.id === p.id) || {}).label || '待确认', tone: 'signal' },
    ];
    // 其余状态排右侧
    const rest = h.states.filter((s) => s.id !== p.id);
    const stepY = (H - 70) / Math.max(1, rest.length - 1 || 1);
    rest.forEach((s, i) => nodes.push({ id: s.id, x: 520, y: 45 + i * (rest.length > 1 ? stepY : 0), label: s.label, tone: s.tone }));
    const nodeById = (id) => nodes.find((n) => n.id === id);
    return head('人机交互', 'Human-in-the-loop state machine · editable states & outcomes', 'FILE NO. HUMAN-001') + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card" style="padding:0;overflow:hidden">
          <div class="pl-card__t" style="padding:12px 16px 0">状态机</div>
          <svg viewBox="0 0 \${W} \${H}" style="width:100%;height:\${H}px;display:block">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#a67d48"></path>
              </marker>
            </defs>
            \${h.outcomes.map((o) => {
              const from = nodeById(p.id);
              const to = nodeById(o.to) || from;
              const mx = (from.x + to.x) / 2;
              const d = from.id === to.id
                ? \`M \${from.x + 60} \${from.y} C \${from.x + 120} \${from.y - 70}, \${from.x + 120} \${from.y + 70}, \${from.x + 60} \${from.y}\`
                : \`M \${from.x + 62} \${from.y} C \${mx} \${from.y}, \${mx} \${to.y}, \${to.x - 62} \${to.y}\`;
              return \`<path d="\${d}" fill="none" stroke="#a67d48" stroke-width="1.2" marker-end="url(#arrow)" opacity="0.85"/>
                <text x="\${mx}" y="\${(from.y + to.y) / 2 - 8}" font-size="9" fill="#8a6a3c" text-anchor="middle" font-family="JetBrains Mono,monospace">\${esc(o.option)}</text>\`;
            }).join('')}
            \${nodes.map((n) => \`<g>
              <rect x="\${n.x - 62}" y="\${n.y - 22}" width="124" height="44" fill="#f6f1ea" stroke="\${toneColor[n.tone] || '#171713'}" stroke-width="1.2"/>
              <text x="\${n.x}" y="\${n.y - 4}" font-size="10" fill="#171713" text-anchor="middle" font-family="JetBrains Mono,monospace" font-weight="600">\${esc(n.id)}</text>
              <text x="\${n.x}" y="\${n.y + 11}" font-size="9" fill="#8e897b" text-anchor="middle" font-family="JetBrains Mono,monospace">\${esc(n.label)}</text>
            </g>\`).join('')}
          </svg>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">状态（可增删改）</div>
          <table class="pl-table">
            <thead><tr><th>ID</th><th>Label</th><th>Tone</th><th></th></tr></thead>
            <tbody>\${h.states.map((s, i) => \`<tr>
              <td><input data-st-id="\${i}" value="\${esc(s.id)}" style="width:100%;font:inherit;font-size:10px;padding:2px 4px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td><input data-st-label="\${i}" value="\${esc(s.label)}" style="width:100%;font:inherit;font-size:10px;padding:2px 4px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td><select data-st-tone="\${i}" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2)">
                \${['signal', 'ink', 'danger', 'muted'].map((v) => \`<option\${s.tone === v ? ' selected' : ''}>\${v}</option>\`).join('')}
              </select></td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-st-del="\${i}">移除</button></td>
            </tr>\`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnStateAdd">＋ 状态</button></div>
        </div>
      </div>

      <div class="pl-card" style="margin-top:14px">
        <div class="pl-card__t">操作结果（option → effect → 目标状态）</div>
        <table class="pl-table">
          <thead><tr><th>Option</th><th>Effect</th><th>To state</th><th>Set field</th><th></th></tr></thead>
          <tbody>\${h.outcomes.map((o, i) => \`<tr>
            <td><input data-oc-opt="\${i}" value="\${esc(o.option)}" style="width:100%;font:inherit;font-size:10px;padding:2px 4px;background:#fff;border:1px solid var(--line-2)"/></td>
            <td><select data-oc-eff="\${i}" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2)">
              \${['continue', 'hold', 'abort'].map((v) => \`<option\${o.effect === v ? ' selected' : ''}>\${v}</option>\`).join('')}
            </select></td>
            <td><select data-oc-to="\${i}" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2)">
              \${h.states.map((s) => \`<option\${o.to === s.id ? ' selected' : ''}>\${esc(s.id)}</option>\`).join('')}
            </select></td>
            <td><input data-oc-set="\${i}" value="\${esc(o.set_field || '')}" style="width:100%;font:inherit;font-size:10px;padding:2px 4px;background:#fff;border:1px solid var(--line-2)"/></td>
            <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-oc-del="\${i}">移除</button></td>
          </tr>\`).join('')}</tbody>
        </table>
        <div class="pl-row-end">
          <span class="pl-muted" id="humanMsg" style="margin-right:auto;font-size:9px"></span>
          <button class="pl-btn pl-btn--sm" id="btnOutcomeAdd">＋ 操作结果</button>
          <button class="pl-btn pl-btn--solid" id="btnHumanSave">保存状态机</button>
        </div>
      </div>\`;
  }

`;
rep(`  /* ---------------------------------------------------------------- 视图：OMC */`, VIEW + `  /* ---------------------------------------------------------------- 视图：OMC */`, 'insert human view');

/* 4) 路由 */
rep(`    'task': viewTask,`, `    'task': viewTask,
    'human': viewHuman,`, 'route human');

/* 5) 事件 */
rep(`    // LCM · 包升级 → 生成任务`,
`    // 人机交互状态机编辑
    const humanDraft = () => S.human || { states: [], outcomes: [] };
    $$('[data-st-id]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().states[+el.dataset.stId].id = el.value.trim().toUpperCase();
    }));
    $$('[data-st-label]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().states[+el.dataset.stLabel].label = el.value;
    }));
    $$('[data-st-tone]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().states[+el.dataset.stTone].tone = el.value;
    }));
    $$('[data-st-del]').forEach((b) => b.addEventListener('click', () => {
      humanDraft().states.splice(+b.dataset.stDel, 1); render();
    }));
    const stAdd = $('#btnStateAdd');
    if (stAdd) stAdd.addEventListener('click', () => {
      humanDraft().states.push({ id: 'NEW_STATE', label: '新状态', tone: 'muted' }); render();
    });
    $$('[data-oc-opt]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().outcomes[+el.dataset.ocOpt].option = el.value;
    }));
    $$('[data-oc-eff]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().outcomes[+el.dataset.ocEff].effect = el.value;
    }));
    $$('[data-oc-to]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().outcomes[+el.dataset.ocTo].to = el.value; render();
    }));
    $$('[data-oc-set]').forEach((el) => el.addEventListener('change', () => {
      humanDraft().outcomes[+el.dataset.ocSet].set_field = el.value;
    }));
    $$('[data-oc-del]').forEach((b) => b.addEventListener('click', () => {
      humanDraft().outcomes.splice(+b.dataset.ocDel, 1); render();
    }));
    const ocAdd = $('#btnOutcomeAdd');
    if (ocAdd) ocAdd.addEventListener('click', () => {
      humanDraft().outcomes.push({ option: '新操作', effect: 'continue', to: 'RESOLVED', set_field: '' }); render();
    });
    const hSave = $('#btnHumanSave');
    if (hSave) hSave.addEventListener('click', async () => {
      const msg = $('#humanMsg');
      try {
        S.human = await api('/api/business/human-template', {
          method: 'PATCH', headers: headers(),
          body: JSON.stringify({ states: S.human.states, outcomes: S.human.outcomes }),
        });
        if (msg) { msg.textContent = '已保存到服务端 ✓'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2000); }
      } catch (e) { if (msg) msg.textContent = '保存失败：' + e.message; }
      render();
    });

    // LCM · 包升级 → 生成任务`, 'bind human');

/* 6) 启动载入 */
rep(`        await loadEndpoint(); await loadElements(); await loadLcm();`,
    `        await loadEndpoint(); await loadElements(); await loadLcm(); await loadHuman();`, 'startup human');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
