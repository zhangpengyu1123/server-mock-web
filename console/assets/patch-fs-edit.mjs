#!/usr/bin/env node
/* FS：插入可编辑卡片（配置 + 校验/升级流程增删）+ 事件；保存走 PATCH platform.fs */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① 视图：在 btnFsUpgrade 所在的卡片之后、网格闭合前插入编辑卡 */
const ui = lines.findIndex((l) => l.includes('id="btnFsUpgrade"'));
if (ui < 0) { console.log('MISS btnFsUpgrade'); process.exit(1); }
// 网格闭合行：从 ui 起找第一个 "        </div>`;" 行
let close = ui;
while (close < lines.length && !/^\s*<\/div>`;\s*$/.test(lines[close])) close++;
if (close >= lines.length) { console.log('MISS 网格闭合'); process.exit(1); }
const card = readFileSync('console/assets/fs-edit-card.txt', 'utf8').replace(/\r/g, '').replace(/\n$/, '').split('\n');
lines.splice(close, 0, ...card);
log.push('ok   编辑卡插入（L' + (close + 1) + ' 前）');

/* ② 事件：插在 btnFsUpgrade 的 handler 之后 */
const hi = lines.findIndex((l) => l.includes("const fsUp = $('#btnFsUpgrade');"));
if (hi < 0) { console.log('MISS fsUp'); process.exit(1); }
let hend = hi;
while (hend < lines.length && !/^\s*\}\)\);\s*$/.test(lines[hend])) hend++;
if (hend < lines.length) hend++;
const indent = lines[hi].match(/^\s*/)[0];
const ev = `// FS · 配置与流程编辑（PATCH platform.fs）
const fsCfg = () => Object.assign({}, (S.platform && S.platform.fs) || {});
const fsDraft = () => {
  const c = fsCfg();
  return {
    cpus: Number(($('#fsCpus') || {}).value || c.cpus || 16),
    site_primary: (($('#fsPrimary') || {}).value || '').trim() || c.site_primary,
    site_secondary: (($('#fsSecondary') || {}).value || '').trim() || c.site_secondary,
    version: (($('#fsVersion') || {}).value || '').trim() || c.version,
    verify_steps: $$('[data-fs-verify]').map((el) => el.value.trim()).filter(Boolean),
    upgrade_steps: $$('[data-fs-upgrade]').map((el) => el.value.trim()).filter(Boolean),
    verify_runs: c.verify_runs || [],
  };
};
const fsSave = async (msgSel) => {
  const msg = $(msgSel);
  try {
    S.platform = await api('/api/business/platform', {
      method: 'PATCH', headers: headers(), body: JSON.stringify({ fs: fsDraft() }),
    });
    if (msg) { msg.textContent = '已保存 ✓'; setTimeout(() => { const m = $(msgSel); if (m) m.textContent = ''; }, 2500); }
  } catch (e) { if (msg) msg.textContent = '保存失败：' + e.message; }
  render();
};
const fsSaveBtn = $('#btnFsSave');
if (fsSaveBtn) fsSaveBtn.addEventListener('click', () => fsSave('#fsMsg'));
const fsSaveFlow = $('#btnFsSaveFlow');
if (fsSaveFlow) fsSaveFlow.addEventListener('click', () => fsSave('#fsMsg'));
const fsAddVerify = $('#btnFsVerifyAdd');
if (fsAddVerify) fsAddVerify.addEventListener('click', async () => {
  const c = fsCfg();
  const steps = ($$('[data-fs-verify]').map((el) => el.value.trim()).filter(Boolean)).concat(['新校验步骤']);
  S.platform = await api('/api/business/platform', {
    method: 'PATCH', headers: headers(),
    body: JSON.stringify({ fs: Object.assign({}, c, { verify_steps: steps }) }),
  });
  render();
});
const fsAddUpgrade = $('#btnFsUpgradeAdd');
if (fsAddUpgrade) fsAddUpgrade.addEventListener('click', async () => {
  const c = fsCfg();
  const steps = ($$('[data-fs-upgrade]').map((el) => el.value.trim()).filter(Boolean)).concat(['新升级步骤']);
  S.platform = await api('/api/business/platform', {
    method: 'PATCH', headers: headers(),
    body: JSON.stringify({ fs: Object.assign({}, c, { upgrade_steps: steps }) }),
  });
  render();
});
$$('[data-fs-verify-del]').forEach((b) => b.addEventListener('click', async () => {
  const c = fsCfg();
  const steps = $$('[data-fs-verify]').map((el) => el.value.trim()).filter(Boolean);
  steps.splice(Number(b.dataset.fsVerifyDel), 1);
  S.platform = await api('/api/business/platform', {
    method: 'PATCH', headers: headers(),
    body: JSON.stringify({ fs: Object.assign({}, c, { verify_steps: steps }) }),
  });
  render();
}));
$$('[data-fs-upgrade-del]').forEach((b) => b.addEventListener('click', async () => {
  const c = fsCfg();
  const steps = $$('[data-fs-upgrade]').map((el) => el.value.trim()).filter(Boolean);
  steps.splice(Number(b.dataset.fsUpgradeDel), 1);
  S.platform = await api('/api/business/platform', {
    method: 'PATCH', headers: headers(),
    body: JSON.stringify({ fs: Object.assign({}, c, { upgrade_steps: steps }) }),
  });
  render();
}));`.split('\n').map((l) => (l ? indent + l : l));
lines.splice(hend, 0, ...ev);
log.push('ok   FS 事件');

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
