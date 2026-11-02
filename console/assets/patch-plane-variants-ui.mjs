#!/usr/bin/env node
/* 规则编辑器：多规则（条件 → 状态码/延迟/响应体）编辑与保存 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 状态：variants 草稿 */
rep(`    ifaceRules: [],`, `    ifaceRules: [],
    ifaceVariants: [],   // 多规则（条件匹配）`, 'state variants');

/* 2) 载入规则时同步 variants（在 loadIfaces 或 viewIface 里） */
rep(`      S.ifaceRules = (m.fields || []).map((f) => Object.assign({}, f));`,
`      S.ifaceRules = (m.fields || []).map((f) => Object.assign({}, f));
      S.ifaceVariants = (m.variants || []).map((v) => Object.assign({}, v));`, 'load variants');

/* 3) 视图：多规则区块（插在字段表之后） */
rep(`          <div class="pl-card__t">响应字段（对象化管理）</div>`,
`          <div class="pl-card__t">多规则匹配（按顺序，首个条件命中即生效）</div>
          <table class="pl-table">
            <thead><tr><th>条件（如 req.mode=="fast"，留空=兜底）</th><th>Status</th><th>Delay ms</th><th>响应体</th><th>备注</th><th></th></tr></thead>
            <tbody>
              \${(S.ifaceVariants || []).map((v, i) => \`<tr>
                <td><input data-var-when="\${i}" value="\${esc(v.when || '')}" placeholder='req.mode=="fast"' style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-status="\${i}" value="\${v.status == null ? '' : v.status}" style="width:56px;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-delay="\${i}" value="\${v.delay_ms == null ? '' : v.delay_ms}" style="width:60px;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-body="\${i}" value="\${esc(v.body || '')}" style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-note="\${i}" value="\${esc(v.note || '')}" style="width:70px;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-var-del="\${i}">删除</button></td>
              </tr>\`).join('')}
            </tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnVarAdd">＋ 规则</button></div>

          <div class="pl-card__t">响应字段（对象化管理）</div>`, 'variants table');

/* 4) 事件绑定 */
rep(`    // 保存字段`,
`    // 多规则编辑
    const varSet = (i, key, val) => {
      const v = S.ifaceVariants[i] || (S.ifaceVariants[i] = {});
      if (key === 'status' || key === 'delay_ms') {
        v[key] = val === '' ? null : Number(val);
      } else {
        v[key] = val;
      }
    };
    $$('[data-var-when]').forEach((el) => el.addEventListener('input', () => varSet(+el.dataset.varWhen, 'when', el.value)));
    $$('[data-var-status]').forEach((el) => el.addEventListener('input', () => varSet(+el.dataset.varStatus, 'status', el.value)));
    $$('[data-var-delay]').forEach((el) => el.addEventListener('input', () => varSet(+el.dataset.varDelay, 'delay_ms', el.value)));
    $$('[data-var-body]').forEach((el) => el.addEventListener('input', () => varSet(+el.dataset.varBody, 'body', el.value)));
    $$('[data-var-note]').forEach((el) => el.addEventListener('input', () => varSet(+el.dataset.varNote, 'note', el.value)));
    $$('[data-var-del]').forEach((b) => b.addEventListener('click', () => {
      S.ifaceVariants.splice(+b.dataset.varDel, 1); render();
    }));
    const varAdd = $('#btnVarAdd');
    if (varAdd) varAdd.addEventListener('click', () => {
      S.ifaceVariants.push({ when: '', status: null, delay_ms: null, body: '', note: '' }); render();
    });

    // 保存字段`, 'variants binding');

/* 5) 保存时带上 variants */
rep(`          body: JSON.stringify({ fields: S.ifaceRules }),`,
    `          body: JSON.stringify({ fields: S.ifaceRules, variants: S.ifaceVariants }),`, 'save variants');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
