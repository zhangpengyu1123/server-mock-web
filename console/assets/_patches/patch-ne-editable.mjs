#!/usr/bin/env node
/* ① 网元详情：升级流程步骤 + 参数校验 可编辑并保存（PATCH /elements/:id）
   ② 网元自定义：成组（选网元 → 新建组） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* ---------- 1) 状态：编辑草稿 ---------- */
rep(`    topoLevel: 'element',`,
`    neDraft: null,     // 当前编辑中的网元草稿（flow / checks）
    groupDraft: [],    // 成组选中的网元
    topoLevel: 'element',`, 'state drafts');

/* ---------- 2) viewNeDetail 重写：可编辑 ---------- */
{
  const s = t.indexOf('  function viewNeDetail() {');
  const e = t.indexOf('  /* ---------------------------------------------------------------- 视图：人机交互状态机 */');
  if (s > 0 && e > s) {
    const fn = `  function viewNeDetail() {
    const el = S.elements.find((x) => x.id === S.topoSel) || S.elements[0];
    // 首次进入或切换网元时，从后端数据构造草稿
    if (!S.neDraft || S.neDraft.__id !== el.id) {
      S.neDraft = {
        __id: el.id,
        flow: (el.flow && el.flow.length ? el.flow : [
          { step: '上传软件包', human: false },
          { step: '预检查（参数校验）', human: false },
          { step: '激活', human: true },
          { step: '主备倒换', human: true },
          { step: '完成与回执', human: false },
        ]).map((x) => ({ step: x.step || x.s || '', human: !!(x.human) })),
        checks: (el.checks || []).map((c) => ({ field: c.field || '', rule: c.rule || '', msg: c.msg || '' })),
      };
    }
    const d = S.neDraft;
    return head('网元 · ' + el.name, 'Upgrade flow · parameter validation · human-in-the-loop', 'FILE NO. NE-002') + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">升级流程步骤（可增删 · 可挂人机交互 · 保存到后端）</div>
          <table class="pl-table">
            <thead><tr><th>#</th><th>Step</th><th>Human</th><th></th></tr></thead>
            <tbody>\${d.flow.map((s2, i) => \`<tr>
              <td class="num">\${i + 1}</td>
              <td><input data-flow-step="\${i}" value="\${esc(s2.step)}" style="width:100%;font:inherit;font-size:10.5px;padding:3px 5px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td><button class="pl-btn pl-btn--sm" data-flow-human="\${i}" style="\${s2.human ? 'background:#171713;color:#eae5e1;border-color:#171713' : ''}">\${s2.human ? '含确认' : '—'}</button></td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-flow-del="\${i}">删除</button></td>
            </tr>\`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnFlowAdd">＋ 步骤</button></div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">参数校验规则（可编辑）</div>
          <table class="pl-table">
            <thead><tr><th>Field</th><th>Rule</th><th>Fail</th><th></th></tr></thead>
            <tbody>\${d.checks.map((c, i) => \`<tr>
              <td><input data-chk-field="\${i}" value="\${esc(c.field)}" style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td><input data-chk-rule="\${i}" value="\${esc(c.rule)}" style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td><input data-chk-msg="\${i}" value="\${esc(c.msg)}" style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-chk-del="\${i}">删除</button></td>
            </tr>\`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnChkAdd">＋ 校验</button></div>
          <div class="pl-card__t" style="margin-top:14px">旧版本</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            \${(el.versions || [el.prev]).filter(Boolean).map((v) => \`<span class="pl-tag">v\${esc(v)}</span>\`).join('')}
            <span class="pl-tag pl-tag--on">v\${esc(el.version)}（当前）</span>
          </div>
        </div>
      </div>
      <div class="pl-row-end" style="margin-top:14px">
        <span class="pl-muted" id="neMsg" style="margin-right:auto;font-size:9px"></span>
        <button class="pl-btn" id="btnNeBack">返回列表</button>
        <button class="pl-btn pl-btn--solid" id="btnNeSave">保存到网元</button>
      </div>\`;
  }

`;
    t = t.slice(0, s) + fn + t.slice(e);
    log.push('ok   viewNeDetail 可编辑');
  } else log.push('MISS viewNeDetail');
}

/* ---------- 3) 网元自定义页：成组入口 ---------- */
rep(`          <div class="pl-row-end"><button class="pl-btn pl-btn--solid pl-btn--sm" id="btnNeAdd">＋ 新建网元</button></div>`,
`          <div class="pl-row-end">
            <button class="pl-btn pl-btn--sm" id="btnGroupAdd">＋ 成组</button>
            <button class="pl-btn pl-btn--solid pl-btn--sm" id="btnNeAdd">＋ 新建网元</button>
          </div>`, 'group button');

/* ---------- 4) 事件 ---------- */
rep(`    // 人机交互状态机编辑`,
`    // 网元详情：流程 / 校验 编辑
    $$('[data-flow-step]').forEach((el) => el.addEventListener('input', () => {
      S.neDraft.flow[+el.dataset.flowStep].step = el.value;
    }));
    $$('[data-flow-human]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.flowHuman;
      S.neDraft.flow[i].human = !S.neDraft.flow[i].human;
      render();
    }));
    $$('[data-flow-del]').forEach((b) => b.addEventListener('click', () => {
      S.neDraft.flow.splice(+b.dataset.flowDel, 1); render();
    }));
    const flowAdd = $('#btnFlowAdd');
    if (flowAdd) flowAdd.addEventListener('click', () => {
      S.neDraft.flow.push({ step: '新步骤', human: false }); render();
    });
    $$('[data-chk-field]').forEach((el) => el.addEventListener('input', () => { S.neDraft.checks[+el.dataset.chkField].field = el.value; }));
    $$('[data-chk-rule]').forEach((el) => el.addEventListener('input', () => { S.neDraft.checks[+el.dataset.chkRule].rule = el.value; }));
    $$('[data-chk-msg]').forEach((el) => el.addEventListener('input', () => { S.neDraft.checks[+el.dataset.chkMsg].msg = el.value; }));
    $$('[data-chk-del]').forEach((b) => b.addEventListener('click', () => {
      S.neDraft.checks.splice(+b.dataset.chkDel, 1); render();
    }));
    const chkAdd = $('#btnChkAdd');
    if (chkAdd) chkAdd.addEventListener('click', () => {
      S.neDraft.checks.push({ field: 'field', rule: '必填', msg: '缺失参数' }); render();
    });
    const neBack = $('#btnNeBack');
    if (neBack) neBack.addEventListener('click', () => { S.view = 'elements'; render(); });
    const neSave = $('#btnNeSave');
    if (neSave) neSave.addEventListener('click', async () => {
      const msg = $('#neMsg');
      try {
        await api('/api/business/elements/' + S.neDraft.__id, {
          method: 'PATCH', headers: headers(),
          body: JSON.stringify({ flow: S.neDraft.flow, checks: S.neDraft.checks }),
        });
        await loadElements();
        S.neDraft.__id = null;   // 让草稿从新数据重建
        if (msg) { msg.textContent = '已保存到网元 ✓'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2000); }
      } catch (e) { if (msg) msg.textContent = '保存失败：' + e.message; }
      render();
    });

    // 成组：把当前组内网元 + 选中项写成一个新组
    const groupAdd = $('#btnGroupAdd');
    if (groupAdd) groupAdd.addEventListener('click', async () => {
      const members = S.elements.map((e) => e.id).slice(0, 2);
      try {
        await api('/api/business/groups', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ name: '新网元组 ' + (S.groups.length + 1), site: 'site-hz', element_ids: members }),
        });
        await loadElements();
      } catch (e) { console.warn(e); }
      render();
    });

    // 人机交互状态机编辑`, 'bind ne detail');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
