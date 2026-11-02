#!/usr/bin/env node
/* 新增「接口规则编辑器」视图：status / delay / 响应字段（对象化 + 四种行为参数）/ 条件 / 人机交互节点
   并把 MOCK 流程列表的"编辑"按钮接上 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* ---------- 1. 状态：接口规则 ---------- */
rep(`    topoLevel: 'element',`, `    ifaceSel: 'if-1',
    ifaceRules: {
      'if-1': {
        status: 200, delay: 120,
        fields: [
          { name: 'code', type: 'string', src: 'static', value: '0' },
          { name: 'message', type: 'string', src: 'static', value: 'success' },
          { name: 'data.neId', type: 'string', src: 'condition', value: 'req.neId || "GNB-HZ-0904"' },
          { name: 'data.seq', type: 'number', src: 'autoIncrement', step: 1, max: 9999 },
          { name: 'data.token', type: 'string', src: 'once', value: 'tk-once-0001' },
        ],
        human: [
          { step: '激活', prompt: '升级包已就绪，确认开始激活？', timeout: 60, state: 'PENDING',
            options: [{ l: '确认激活', effect: 'continue', set: 'result=ok' }, { l: '取消', effect: 'abort', set: 'result=cancel' }] },
        ],
      },
    },
    topoLevel: 'element',`, 'state iface');

/* ---------- 2. 视图 ---------- */
const view = `
  /* ---------------------------------------------------------------- 视图：接口规则编辑器 */
  function viewIface() {
    const id = S.ifaceSel;
    const base = S.ifaces.find((x) => x.id === id) || S.ifaces[0];
    const r = S.ifaceRules[id] || (S.ifaceRules[id] = { status: base.status, delay: base.delay, fields: [], human: [] });
    const SRC_LABEL = { static: '静态值', autoIncrement: '自增', once: '单次生效', condition: '条件表达式' };
    return head('接口 · ' + base.method + ' ' + base.path, 'Response rules · field behaviors · human-in-the-loop', 'FILE NO. FLOW-002') + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">响应基础</div>
          <div class="pl-form">
            <div class="pl-field--row">
              <div class="pl-field"><label>HTTP Status</label>
                <select id="ifStatus">\${[200, 201, 202, 204, 400, 401, 403, 404, 500, 503].map((s) => \`<option\${r.status === s ? ' selected' : ''}>\${s}</option>\`).join('')}</select>
              </div>
              <div class="pl-field"><label>Delay (ms)</label><input id="ifDelay" value="\${r.delay}" /></div>
            </div>
            <div class="pl-field"><label>Content-Type</label><input value="application/json" readonly /></div>
          </div>

          <div class="pl-card__t" style="margin-top:16px">响应字段（对象化管理）</div>
          <table class="pl-table">
            <thead><tr><th>Field</th><th>Type</th><th>Behavior</th><th>Param</th><th></th></tr></thead>
            <tbody>
              \${r.fields.map((f, i) => \`<tr>
                <td>\${esc(f.name)}</td>
                <td><select data-fld-type="\${i}" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2)">
                  \${['string', 'number', 'boolean', 'object', 'array'].map((ty) => \`<option\${f.type === ty ? ' selected' : ''}>\${ty}</option>\`).join('')}
                </select></td>
                <td><select data-fld-src="\${i}" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2)">
                  \${Object.keys(SRC_LABEL).map((k) => \`<option value="\${k}"\${f.src === k ? ' selected' : ''}>\${SRC_LABEL[k]}</option>\`).join('')}
                </select></td>
                <td class="pl-muted" style="font-size:9px">
                  \${f.src === 'autoIncrement'
                    ? 'step=' + f.step + ' · max=' + f.max
                    : f.src === 'condition' ? esc(f.value || '') : esc(f.value || '—')}
                </td>
                <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-fld-del="\${i}">移除</button></td>
              </tr>\`).join('')}
            </tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="ifFldAdd">＋ 添加字段</button></div>
        </div>

        <div class="pl-card">
          <div class="pl-card__t">人机交互节点（可自定义状态与操作结果）</div>
          \${r.human.length ? r.human.map((h, hi) => \`<div style="border:1px solid var(--line);padding:10px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <b style="font-size:11px">\${esc(h.step)}</b>
              <span class="pl-tag pl-tag--on">\${esc(h.state)}</span>
            </div>
            <div style="margin:6px 0;font-size:10.5px;line-height:1.7">\${esc(h.prompt)}</div>
            <div class="pl-muted" style="font-size:8.5px">超时 \${h.timeout}s</div>
            <table class="pl-table" style="margin-top:6px">
              <thead><tr><th>Option</th><th>Effect</th><th>Set field</th></tr></thead>
              <tbody>\${h.options.map((o) => \`<tr><td>\${esc(o.l)}</td><td>\${esc(o.effect)}</td><td class="pl-muted">\${esc(o.set)}</td></tr>\`).join('')}</tbody>
            </table>
            <div class="pl-row-end"><button class="pl-btn pl-btn--sm" data-human-preview="\${hi}">预览</button></div>
          </div>\`).join('') : '<div class="pl-muted" style="font-size:10px;padding:8px 0">还没有人机交互节点</div>'}
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="ifHumanAdd">＋ 插入人机交互</button></div>
        </div>
      </div>
      <div class="pl-row-end" style="margin-top:14px">
        <button class="pl-btn" id="ifBack">返回接口列表</button>
      </div>\`;
  }
`;

rep(`  /* ---------------------------------------------------------------- 拓扑渲染 */`, view + `\n  /* ---------------------------------------------------------------- 拓扑渲染 */`, 'insert iface view');

/* ---------- 3. 路由 ---------- */
rep(`    'ne-detail': viewNeDetail,`, `    'ne-detail': viewNeDetail,
    'iface': viewIface,`, 'route iface');

/* ---------- 4. 列表"编辑"跳到接口视图 ---------- */
rep(`              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-iface="\${esc(i.id)}">编辑</button></td>`,
    `              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-iface="\${esc(i.id)}">编辑</button></td>`, 'list button exists');

/* ---------- 5. 事件 ---------- */
rep(`    // 平台页`, `    // 接口规则编辑器
    $$('[data-iface]').forEach((b) => b.addEventListener('click', () => {
      S.ifaceSel = b.dataset.iface; S.view = 'iface'; render();
    }));
    const ifBack = $('#ifBack');
    if (ifBack) ifBack.addEventListener('click', () => { S.view = 'mock-flow'; render(); });
    const ifStatus = $('#ifStatus');
    if (ifStatus) ifStatus.addEventListener('change', () => {
      const r = S.ifaceRules[S.ifaceSel]; r.status = +ifStatus.value;
      const b = S.ifaces.find((x) => x.id === S.ifaceSel); if (b) b.status = r.status;
      render();
    });
    const ifDelay = $('#ifDelay');
    if (ifDelay) ifDelay.addEventListener('change', () => {
      const r = S.ifaceRules[S.ifaceSel]; r.delay = +ifDelay.value || 0;
      const b = S.ifaces.find((x) => x.id === S.ifaceSel); if (b) b.delay = r.delay;
      render();
    });
    $$('[data-fld-src]').forEach((sel) => sel.addEventListener('change', () => {
      const r = S.ifaceRules[S.ifaceSel]; r.fields[+sel.dataset.fldSrc].src = sel.value; render();
    }));
    $$('[data-fld-type]').forEach((sel) => sel.addEventListener('change', () => {
      const r = S.ifaceRules[S.ifaceSel]; r.fields[+sel.dataset.fldType].type = sel.value; render();
    }));
    $$('[data-fld-del]').forEach((b) => b.addEventListener('click', () => {
      S.ifaceRules[S.ifaceSel].fields.splice(+b.dataset.fldDel, 1); render();
    }));
    const fAdd = $('#ifFldAdd');
    if (fAdd) fAdd.addEventListener('click', () => {
      S.ifaceRules[S.ifaceSel].fields.push({ name: 'newField', type: 'string', src: 'static', value: '' }); render();
    });
    const hAdd = $('#ifHumanAdd');
    if (hAdd) hAdd.addEventListener('click', () => {
      S.ifaceRules[S.ifaceSel].human.push({
        step: '人工确认', prompt: '请确认是否继续执行', timeout: 60, state: 'PENDING',
        options: [{ l: '继续', effect: 'continue', set: 'result=ok' }, { l: '终止', effect: 'abort', set: 'result=abort' }],
      });
      render();
    });
    $$('[data-human-preview]').forEach((b) => b.addEventListener('click', () => {
      const h = S.ifaceRules[S.ifaceSel].human[+b.dataset.humanPreview];
      openHuman({ prompt: h.prompt, timeout: h.timeout, options: h.options.map((o) => ({ l: o.l, next: o.effect })) });
    }));

    // 平台页`, 'bind iface');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
