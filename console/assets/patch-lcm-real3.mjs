#!/usr/bin/env node
/* LCM 真表单/真开关（按行号/包含匹配，忽略缩进） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① 状态 */
const si = lines.findIndex((l) => l.includes('accSel: 0,'));
if (si >= 0 && !lines[si + 1].includes('pkgDraft')) {
  lines.splice(si + 1, 0, "    pkgDraft: { name: '', kind: '网元软件包', owner: '', vendor: '', version: '' },");
  log.push('ok   状态');
}

/* ② 视图：按钮 → 表单 */
const bi = lines.findIndex((l) => l.includes('id="btnPkgAdd"'));
if (bi >= 0) {
  const form = readFileSync('console/assets/lcm-pkg-form.txt', 'utf8').replace(/\r/g, '').replace(/\n$/, '').split('\n');
  lines.splice(bi, 1, ...form);
  log.push('ok   表单');
} else log.push('MISS 按钮');

/* ③ 共部署：真开关 */
const ci = lines.findIndex((l) => l.includes("const co = $('#btnCoDeploy');"));
if (ci >= 0 && lines[ci + 1].includes('S.lcm.coDeploy = !S.lcm.coDeploy')) {
  const indent = lines[ci + 1].match(/^\s*/)[0];
  lines.splice(ci + 1, 1,
    indent + "if (co) co.addEventListener('click', async () => {",
    indent + "  const next = !(S.platform ? !!S.platform.co_deploy : S.lcm.coDeploy);",
    indent + "  try {",
    indent + "    S.platform = await api('/api/business/platform', { method: 'PATCH', headers: headers(), body: JSON.stringify({ co_deploy: next }) });",
    indent + "  } catch (e) { console.warn(e); }",
    indent + "  render();",
    indent + "});");
  log.push('ok   共部署');
} else log.push('MISS 共部署');

/* ④ 登记：真 POST */
const pi = lines.findIndex((l) => l.includes("const pkgAdd = $('#btnPkgAdd');"));
if (pi >= 0) {
  let end = pi;
  while (end < lines.length && !/^\s*\}\);\s*$/.test(lines[end])) end++;
  if (end < lines.length) end++;  // 含 "});" 行
  const indent = lines[pi].match(/^\s*/)[0];
  const ev = `// LCM · 软件包登记（写后端）
const draftBind = (id, key, isSelect) => {
  const el = $('#' + id);
  if (!el) return;
  el.addEventListener(isSelect ? 'change' : 'input', () => { S.pkgDraft[key] = el.value; });
};
draftBind('pkgName', 'name');
draftBind('pkgKind', 'kind', true);
draftBind('pkgOwner', 'owner', true);
draftBind('pkgVendor', 'vendor');
draftBind('pkgVersion', 'version');
if (!S.pkgDraft.owner && S.elements[0]) S.pkgDraft.owner = S.elements[0].id;
const pkgSubmit = $('#btnPkgSubmit');
if (pkgSubmit) pkgSubmit.addEventListener('click', async () => {
  const msg = $('#pkgMsg');
  const d = S.pkgDraft;
  if (!d.name.trim() || !d.version.trim()) { if (msg) msg.textContent = '包名与版本必填'; return; }
  try {
    await api('/api/business/packages', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ name: d.name.trim(), kind: d.kind, owner: d.owner || (S.elements[0] || {}).id, vendor: d.vendor.trim() || '—', version: d.version.trim() }),
    });
    await loadLcm();
    S.pkgDraft = { name: '', kind: d.kind, owner: d.owner, vendor: d.vendor, version: '' };
    if (msg) msg.textContent = '已登记 ✓';
  } catch (e) { if (msg) msg.textContent = '登记失败：' + e.message; }
  render();
});
$$('[data-pkg-for]').forEach((b) => b.addEventListener('click', () => {
  S.pkgDraft.owner = b.dataset.pkgFor;
  render();
}));`.split('\n').map((l) => (l ? indent + l : l));
  lines.splice(pi, end - pi, ...ev);
  log.push('ok   登记事件');
} else log.push('MISS 登记事件');

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
