#!/usr/bin/env node
/* 多规则 UI 事件 + 保存（在 viewIface 的字段绑定附近插入） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 事件：插在 "保存字段" 相关绑定之前（用唯一的 addRuleBtn 附近） */
rep(`    const addRule = $('#addRuleBtn');`,
`    // 多规则编辑
    const bindVar = (sel, key) => {
      $$(sel).forEach((el) => el.addEventListener('input', () => {
        const i = +(el.dataset.varWhen ?? el.dataset.varStatus ?? el.dataset.varDelay ?? el.dataset.varBody ?? el.dataset.varNote);
        const arr = S.ifaceVariants[S.ifaceSel] || (S.ifaceVariants[S.ifaceSel] = []);
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
      const arr = S.ifaceVariants[S.ifaceSel] || [];
      arr.splice(+b.dataset.varDel, 1);
      render();
    }));
    const varAddBtn = $('#btnVarAdd');
    if (varAddBtn) varAddBtn.addEventListener('click', () => {
      const arr = S.ifaceVariants[S.ifaceSel] || (S.ifaceVariants[S.ifaceSel] = []);
      arr.push({ when: '', status: null, delay_ms: null, body: '', note: '' });
      render();
    });

    const addRule = $('#addRuleBtn');`, 'variants events');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
