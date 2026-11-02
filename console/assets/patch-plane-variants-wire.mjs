#!/usr/bin/env node
/* 在多规则 UI 所在的视图里挂事件 + 保存时带上 variants（按真实 save handler 改） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* 1) 保存：加 variants 字段 */
const si = lines.findIndex((l) => l.includes("method: 'PATCH', headers: headers(), body: JSON.stringify({") && l.includes("fields: r.fields.map"));
if (si >= 0) {
  // 在 "human: r.human.length ? {" 之前插入 variants
  let k = si;
  while (k < si + 20 && !lines[k].includes('human: r.human.length ?')) k++;
  lines.splice(k, 0, '              variants: (S.ifaceVariants[S.ifaceSel] || []).map((v) => ({',
    "                when: v.when || '',",
    "                status: v.status == null ? null : Number(v.status),",
    "                delay_ms: v.delay_ms == null ? null : Number(v.delay_ms),",
    "                body: v.body == null ? null : v.body,",
    "                note: v.note || '',",
    '              })),');
  log.push('ok   保存 variants');
}

/* 2) 事件：插在 ifSave 绑定之后 */
const bi = lines.findIndex((l) => l.includes("const ifSave = $('#ifSave');"));
if (bi >= 0) {
  // 找到该 handler 结束（下一个 '      });' 行之后）
  let end = bi;
  while (end < lines.length && !(lines[end].trim() === '});' )) end++;
  const ev = `
      // 多规则编辑（条件 / 状态码 / 延迟 / 响应体）
      const varArr = () => (S.ifaceVariants[S.ifaceSel] || (S.ifaceVariants[S.ifaceSel] = []));
      const bindVar = (sel, key) => {
        $$(sel).forEach((el) => el.addEventListener('input', () => {
          const i = +(el.dataset.varWhen ?? el.dataset.varStatus ?? el.dataset.varDelay ?? el.dataset.varBody ?? el.dataset.varNote);
          const arr = varArr();
          const v = arr[i] || (arr[i] = {});
          if (key === 'status' || key === 'delay_ms') v[key] = el.value === '' ? null : Number(el.value);
          else v[key] = el.value;
        }));
      };
      bindVar('[data-var-when]', 'when');
      bindVar('[data-var-status]', 'status');
      bindVar('[data-var-delay]', 'delay_ms');
      bindVar('[data-var-body]', 'body');
      bindVar('[data-var-note]', 'note');
      $$('[data-var-del]').forEach((b) => b.addEventListener('click', () => {
        varArr().splice(+b.dataset.varDel, 1);
        render();
      }));
      const varAddBtn = $('#btnVarAdd');
      if (varAddBtn) varAddBtn.addEventListener('click', () => {
        varArr().push({ when: '', status: null, delay_ms: null, body: '', note: '' });
        render();
      });
`.split('\n');
  lines = [...lines.slice(0, end + 1), ...ev, ...lines.slice(end + 1)];
  log.push('ok   事件绑定');
}

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
