#!/usr/bin/env node
/* 新建网元：真表单（架构/类型/版本/软件/组/组件）+ POST */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① 状态 */
const si = lines.findIndex((l) => l.includes('pkgDraft:'));
if (si >= 0) {
  lines.splice(si + 1, 0,
    "    neForm: { open: false, name: '', arch: 'SA', kind: 'gNB', version: '5.2.1', software: 'NR-RAN', group: '', comps: ['主控板', '业务板', '电源'] },");
  log.push('ok   状态 neForm');
}

/* ② 视图：按钮行 → 按钮 + 可展开表单 */
const bi = lines.findIndex((l) => l.includes('id="btnNeAdd"'));
if (bi >= 0) {
  const form = readFileSync('console/assets/ne-form.txt', 'utf8').replace(/\r/g, '').replace(/\n$/, '').split('\n');
  lines.splice(bi, 1, ...form);
  log.push('ok   表单块');
} else log.push('MISS 按钮');

/* ③ 事件：替换写死的 handler */
const hi = lines.findIndex((l) => l.includes("const na = $('#btnNeAdd');"));
if (hi >= 0) {
  let end = hi;
  while (end < lines.length && !/^\s*\}\);\s*$/.test(lines[end])) end++;
  if (end < lines.length) end++;
  const indent = lines[hi].match(/^\s*/)[0];
  const ev = `// 网元 · 新建（真表单）
const neFormBind = (id, key, isSelect) => {
  const el = $('#' + id);
  if (!el) return;
  el.addEventListener(isSelect ? 'change' : 'input', () => { S.neForm[key] = el.value; });
};
const neOpen = $('#btnNeForm');
if (neOpen) neOpen.addEventListener('click', () => {
  S.neForm.open = !S.neForm.open;
  if (S.neForm.open && !S.neForm.group) S.neForm.group = (S.groups[0] || {}).id || '';
  render();
});
neFormBind('neName', 'name');
neFormBind('neArch', 'arch', true);
neFormBind('neKind', 'kind', true);
neFormBind('neVersion', 'version');
neFormBind('neSoftware', 'software');
neFormBind('neGroup', 'group', true);
$$('[data-ne-comp]').forEach((b) => b.addEventListener('click', () => {
  const c = b.dataset.neComp;
  const arr = S.neForm.comps || (S.neForm.comps = []);
  S.neForm.comps = arr.includes(c) ? arr.filter((x) => x !== c) : arr.concat([c]);
  render();
}));
const neCancel = $('#btnNeCancel');
if (neCancel) neCancel.addEventListener('click', () => { S.neForm.open = false; render(); });
const neSubmit = $('#btnNeSubmit');
if (neSubmit) neSubmit.addEventListener('click', async () => {
  const msg = $('#neFormMsg');
  const f = S.neForm;
  if (!f.name.trim()) { if (msg) msg.textContent = '网元名必填'; return; }
  try {
    await api('/api/business/elements', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({
        name: f.name.trim(), arch: f.arch, kind: f.kind,
        version: f.version.trim() || '5.2.1',
        software: f.software.trim() || 'NR-RAN',
        group: f.group || (S.groups[0] || {}).id || '',
        components: f.comps && f.comps.length ? f.comps : ['主控板'],
      }),
    });
    await loadElements();
    S.neForm = { open: false, name: '', arch: f.arch, kind: f.kind, version: '', software: f.software, group: f.group, comps: f.comps };
  } catch (e) { if (msg) msg.textContent = '创建失败：' + e.message; }
  render();
});`.split('\n').map((l) => (l ? indent + l : l));
  lines.splice(hi, end - hi, ...ev);
  log.push('ok   表单事件');
} else log.push('MISS handler');

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
