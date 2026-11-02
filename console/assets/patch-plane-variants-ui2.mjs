#!/usr/bin/env node
/* 多规则 UI：按真实数据结构（S.ifaceRules[mappingId]）改 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
const lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* 1) 状态：在 ifaceRules 对象后加 ifaceVariants */
const si = lines.findIndex((l) => l.includes("ifaceRules: {"));
if (si >= 0) {
  // 找到该对象结束（第一个以 '    },' 结尾的行）
  let e = si;
  while (e < lines.length && !(lines[e].trim() === '},')) e++;
  lines.splice(e + 1, 0, "    ifaceVariants: {},  // mappingId -> 多规则数组");
  log.push('ok   状态字段');
}

/* 2) 载入：在 S.ifaceRules[m.id] = { 之后同步 variants */
const li = lines.findIndex((l) => l.includes('S.ifaceRules[m.id] = {'));
if (li >= 0) {
  let e = li;
  while (e < lines.length && !(lines[e].trim() === '};')) e++;
  lines.splice(e + 1, 0,
    "      S.ifaceVariants[m.id] = (m.variants || []).map((v) => Object.assign({}, v));");
  log.push('ok   载入 variants');
}

/* 3) 视图：多规则表格插在"响应字段（对象化管理）"之前 */
const vi = lines.findIndex((l) => l.includes('响应字段（对象化管理）'));
if (vi >= 0) {
  const block = `          <div class="pl-card__t">多规则匹配（按顺序，首个条件命中即生效）</div>
          <table class="pl-table">
            <thead><tr><th>条件（req.mode=="fast"，留空=兜底）</th><th>Status</th><th>Delay</th><th>响应体</th><th>备注</th><th></th></tr></thead>
            <tbody>
              \${((S.ifaceVariants[id]) || []).map((v, i) => \`<tr>
                <td><input data-var-when="\${i}" value="\${esc(v.when || '')}" placeholder='req.mode=="fast"' style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-status="\${i}" value="\${v.status == null ? '' : v.status}" style="width:54px;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-delay="\${i}" value="\${v.delay_ms == null ? '' : v.delay_ms}" style="width:56px;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-body="\${i}" value="\${esc(v.body || '')}" style="width:100%;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td><input data-var-note="\${i}" value="\${esc(v.note || '')}" style="width:64px;font:inherit;font-size:10px;padding:3px;background:#fff;border:1px solid var(--line-2)"/></td>
                <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-var-del="\${i}">删除</button></td>
              </tr>\`).join('')}
            </tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--sm" id="btnVarAdd">＋ 规则</button></div>
`.split('\n');
  lines.splice(vi, 0, ...block);
  log.push('ok   多规则表格');
}

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
