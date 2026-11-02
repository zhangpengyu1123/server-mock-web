#!/usr/bin/env node
/* OMC 账号表改造：按行号替换 tbody 区块，插入授权编辑面板 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);

/* 定位老账号表 tbody 行 */
const th = lines.findIndex((l) => l.includes('<thead><tr><th>Account</th><th>Role</th><th>Scope</th></tr></thead>'));
if (th < 0) { console.log('MISS thead'); process.exit(1); }
const tr = lines.findIndex((l, i) => i > th && l.includes('accounts.map((a) => `<tr>'));
const end = lines.findIndex((l, i) => i > tr && l.includes('</table>'));
if (tr < 0 || end < 0) { console.log('MISS tbody'); process.exit(1); }

const block = String.raw`              <thead><tr><th>Account</th><th>Role</th><th>Scope</th><th></th></tr></thead>
              <tbody>${accounts.map((a, i) => `<tr style="cursor:pointer${S.accSel === i ? ';background:rgba(166,125,72,.08)' : ''}" data-acc-row="${i}">
                <td>${esc(a.name)}</td><td>${esc(a.role)}</td>
                <td class="pl-muted">${(a.scope || []).length} 个网元</td>
                <td style="text-align:right"><span class="pl-tag ${S.accSel === i ? 'pl-tag--on' : ''}">${S.accSel === i ? '编辑中' : '授权'}</span></td></tr>`).join('')}</tbody>
            </table>

            ${accounts[S.accSel] ? `<div style="border:1px solid var(--line-2);padding:10px;margin-top:10px">
              <div class="pl-muted" style="font-size:8.5px;letter-spacing:.16em;margin-bottom:6px">
                授权范围 · ${esc(accounts[S.accSel].name)}（点选网元写入 scope）
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">
                ${S.elements.map((el) => {
                  const on = (accounts[S.accSel].scope || []).includes(el.id);
                  return `<button class="pl-btn pl-btn--sm" data-acc-scope="${esc(el.id)}"
                    style="${on ? 'background:#171713;color:#eae5e1;border-color:#171713' : ''}">${esc(el.name)}</button>`;
                }).join('')}
              </div>
              <div class="pl-row-end" style="justify-content:flex-start;gap:8px">
                <button class="pl-btn pl-btn--sm" id="btnAccAll">全选纳管网元</button>
                <button class="pl-btn pl-btn--sm" id="btnAccNone">清空</button>
                <button class="pl-btn pl-btn--sm pl-btn--solid" id="btnAccSave">保存授权</button>
                <span class="pl-muted" id="accMsg" style="font-size:9px"></span>
              </div>
            </div>` : ''}`.split('\n');

// 替换 [th .. end]（含老 thead / tbody / </table>）
lines = [...lines.slice(0, th), ...block, ...lines.slice(end + 1)];
writeFileSync(P, lines.join('\n'), 'utf8');
console.log('ok   账号表已替换（原 ' + (th + 1) + ' - ' + (end + 1) + '）');
