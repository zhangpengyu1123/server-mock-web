#!/usr/bin/env node
/* ① 重命名重复的 chkAdd ② 用区间替换 viewNeDetail（可编辑版） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');

/* ① 重命名第二处 chkAdd（我新加的） */
const idxAll = [];
let pos = 0;
while ((pos = t.indexOf('const chkAdd =', pos)) >= 0) { idxAll.push(pos); pos += 5; }
if (idxAll.length > 1) {
  const second = idxAll[1];
  // 只在第二处附近替换（该 const 及其后 4 行内的使用）
  const seg = t.slice(second, second + 320);
  const replaced = seg.replace(/chkAdd/g, 'chkAddBtn');
  t = t.slice(0, second) + replaced + t.slice(second + 320);
  console.log('ok   chkAdd 重命名');
}

/* ② 替换 viewNeDetail 区间 */
const start = t.indexOf('  function viewNeDetail() {');
if (start < 0) { console.log('MISS viewNeDetail'); process.exit(1); }
// 找下一个顶层函数注释或 function 定义
const markers = ['  /* ---------------------------------------------------------------- 视图：人机交互状态机 */', '  function viewHuman()'];
let end = -1;
for (const m of markers) { const i = t.indexOf(m, start); if (i > start && (end < 0 || i < end)) end = i; }
if (end < 0) { console.log('MISS end'); process.exit(1); }

const fn = `  function viewNeDetail() {
    const el = S.elements.find((x) => x.id === S.topoSel) || S.elements[0];
    if (!S.neDraft || S.neDraft.__id !== el.id) {
      S.neDraft = {
        __id: el.id,
        flow: (el.flow && el.flow.length ? el.flow : [
          { step: '上传软件包', human: false },
          { step: '预检查（参数校验）', human: false },
          { step: '激活', human: true },
          { step: '主备倒换', human: true },
          { step: '完成与回执', human: false },
        ]).map((x) => ({ step: x.step || '', human: !!x.human })),
        checks: (el.checks || []).map((c) => ({ field: c.field || '', rule: c.rule || '', msg: c.msg || '' })),
      };
    }
    const d = S.neDraft;
    return head('网元 · ' + el.name, 'Upgrade flow · parameter validation · human-in-the-loop', 'FILE NO. NE-002') + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">升级流程步骤（可增删 · 点开关挂人机交互 · 保存到后端）</div>
          <table class="pl-table">
            <thead><tr><th>#</th><th>Step</th><th>Human</th><th></th></tr></thead>
            <tbody>\${d.flow.map((st, i) => \`<tr>
              <td class="num">\${i + 1}</td>
              <td><input data-flow-step="\${i}" value="\${esc(st.step)}" style="width:100%;font:inherit;font-size:10.5px;padding:3px 5px;background:#fff;border:1px solid var(--line-2)"/></td>
              <td><button class="pl-btn pl-btn--sm" data-flow-human="\${i}" style="\${st.human ? 'background:#171713;color:#eae5e1;border-color:#171713' : ''}">\${st.human ? '含确认' : '—'}</button></td>
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
          <div class="pl-card__t" style="margin-top:14px">版本</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="pl-tag pl-tag--on">v\${esc(el.version)}（当前）</span>
            \${(el.prev && el.prev !== '—') ? \`<span class="pl-tag">v\${esc(el.prev)}</span>\` : ''}
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
t = t.slice(0, start) + fn + t.slice(end);
console.log('ok   viewNeDetail 替换为可编辑版');
writeFileSync(P, t, 'utf8');
