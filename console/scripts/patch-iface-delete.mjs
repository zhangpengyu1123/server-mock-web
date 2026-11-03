// 业务面 MOCK 流程：接口列表加「删除」（两段确认 → DELETE /api/business/mappings/:id）
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];

/* ① 行内按钮：编辑 + 删除 */
const a1 = `                <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-iface="\${esc(i.id)}">编辑</button></td>`;
const b1 = `                <td style="text-align:right;white-space:nowrap">
                  <button class="pl-btn pl-btn--sm" data-iface="\${esc(i.id)}">编辑</button>
                  <button class="pl-btn pl-btn--sm pl-btn--danger" data-iface-del="\${esc(i.id)}" data-armed="0">删除</button>
                </td>`;
if (t.includes(a1)) { t = t.replace(a1, b1); log.push('ok   行内删除按钮'); }
else log.push('MISS 行内按钮锚点');

/* ② 事件：两段确认 + DELETE + 刷新 */
const anchor = `      $$('[data-iface]').forEach((b) => b.addEventListener('click', () => {`;
if (t.includes(anchor) && !t.includes('data-iface-del')) {
  log.push('MISS 事件（需手工插入）');
} else if (!t.includes(`$$('[data-iface-del]')`)) {
  const ev = `
      // 接口删除：第一次点变「确认删除？」，4s 内再点才真删
      $$('[data-iface-del]').forEach((b) => {
        let timer = 0;
        b.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          if (b.dataset.armed !== '1') {
            b.dataset.armed = '1';
            b.dataset.label = b.textContent;
            b.textContent = '确认删除？';
            clearTimeout(timer);
            timer = setTimeout(() => {
              b.dataset.armed = '0';
              b.textContent = b.dataset.label || '删除';
            }, 4000);
            return;
          }
          clearTimeout(timer);
          b.disabled = true;
          try {
            await api('/api/business/mappings/' + encodeURIComponent(b.dataset.ifaceDel), {
              method: 'DELETE', headers: headers(),
            });
            await loadIfaces();
            if (S.ifaceSel === b.dataset.ifaceDel) S.ifaceSel = (S.ifaces[0] || {}).id || '';
          } catch (e) { console.warn(e); }
          render();
        });
      });
`;
  // 插到 $$('[data-iface]') 事件之前
  const i = t.indexOf(anchor);
  t = t.slice(0, i) + ev + t.slice(i);
  log.push('ok   删除事件');
} else log.push('skip 事件（已存在）');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
