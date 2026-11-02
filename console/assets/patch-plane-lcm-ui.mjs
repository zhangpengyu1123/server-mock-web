#!/usr/bin/env node
/* LCM 软件包 + 平台配置接后端，并加"包升级 → 任务"联动按钮 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* 1) 载入包与平台配置 */
rep(`  async function loadElements() {`,
`  async function loadLcm() {
    try {
      const [pkgs, cfg] = await Promise.all([
        api('/api/business/packages'),
        api('/api/business/platform'),
      ]);
      if (Array.isArray(pkgs)) S.packages = pkgs;
      if (cfg) S.platform = cfg;
    } catch (e) { /* 离线保留演示数据 */ }
    return { packages: S.packages, platform: S.platform };
  }

  async function loadElements() {`, 'loadLcm');

rep(`    tasks: [],         // 升级任务（来自后端）`,
`    tasks: [],         // 升级任务（来自后端）
    packages: [],      // LCM 软件包（来自后端）
    platform: null,    // 平台配置（共部署 / FS）`, 'state packages');

/* 2) 重写 LCM 视图 */
let s = t.indexOf('  function viewLcm() {');
let e = t.indexOf('  /* ---------------------------------------------------------------- 视图：FS */');
if (s > 0 && e > s) {
  const fn = `  function viewLcm() {
    const l = S.lcm;
    const pkgs = (S.packages && S.packages.length) ? S.packages : l.packages;
    const byId = (id) => (S.elements.find((x) => x.id === id) || {}).name || id;
    const co = S.platform ? !!S.platform.co_deploy : l.coDeploy;
    return head('LCM 平台', 'Element versions · software packages · co-deploy with OMC', 'FILE NO. LCM-001') + \`
      <div class="pl-grid pl-grid--side">
        <div class="pl-card">
          <div class="pl-card__t">管理的网元与当前版本</div>
          <table class="pl-table">
            <thead><tr><th>Element</th><th>Software</th><th>Current</th><th>Prev</th><th></th></tr></thead>
            <tbody>\${S.elements.map((el) => \`<tr>
              <td>\${esc(el.name)}</td><td class="pl-muted">\${esc(el.sw)}</td>
              <td class="num">v\${esc(el.version)}</td>
              <td class="pl-muted num">\${esc(el.prev || '—')}</td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-pkg-for="\${esc(el.id)}">软件包</button></td>
            </tr>\`).join('')}</tbody>
          </table>
          <div class="pl-row-end" style="align-items:center">
            <span class="pl-muted" style="font-size:8.5px;margin-right:auto">与 OMC 共部署：\${co ? '<span class="pl-dot pl-dot--on"></span>已开启' : '未开启'}</span>
            <button class="pl-btn pl-btn--sm" id="btnCoDeploy">\${co ? '关闭共部署' : '开启共部署'}</button>
          </div>
        </div>
        <div class="pl-card">
          <div class="pl-card__t">软件包仓库（点「升级」直接生成 OMC 任务）</div>
          <table class="pl-table">
            <thead><tr><th>Package</th><th>类型</th><th>所属网元</th><th>厂商</th><th>版本</th><th></th></tr></thead>
            <tbody>\${pkgs.map((p) => \`<tr>
              <td>\${esc(p.name)}</td><td class="pl-muted">\${esc(p.kind)}</td>
              <td class="pl-muted">\${esc(byId(p.owner))}</td>
              <td class="pl-muted">\${esc(p.vendor)}</td><td class="num">v\${esc(p.version)}</td>
              <td style="text-align:right"><button class="pl-btn pl-btn--sm" data-pkg-up="\${esc(p.id)}" data-pkg-ver="\${esc(p.version)}">升级</button></td>
            </tr>\`).join('')}</tbody>
          </table>
          <div class="pl-row-end"><button class="pl-btn pl-btn--solid pl-btn--sm" id="btnPkgAdd">＋ 登记软件包</button></div>
        </div>
      </div>\`;
  }

`;
  t = t.slice(0, s) + fn + t.slice(e);
  log.push('ok   viewLcm 重写');
} else log.push('MISS viewLcm 区间');

/* 3) FS 视图改用后端配置 */
rep(`      <div class="pl-grid pl-grid--3">
        <div class="pl-card">
          <div class="pl-card__t">平台配置</div>
          <dl class="pl-kv">
            <dt>CPU</dt><dd>\${f.cpus} vCPU</dd>`,
`      <div class="pl-grid pl-grid--3">
        <div class="pl-card">
          <div class="pl-card__t">平台配置</div>
          <dl class="pl-kv">
            <dt>CPU</dt><dd>\${f.cpus} vCPU</dd>`, 'fs anchor (noop)');

// 用后端 fs 覆盖 f
rep(`  function viewFs() {
    const f = S.fs;`,
`  function viewFs() {
    const f = Object.assign({}, S.fs, (S.platform && S.platform.fs) ? {
      cpus: S.platform.fs.cpus,
      sitePrimary: S.platform.fs.site_primary,
      siteSecondary: S.platform.fs.site_secondary,
      platformVersion: S.platform.fs.version,
      verifySteps: S.platform.fs.verify_steps,
      upgrade: S.platform.fs.upgrade_steps,
    } : {});`, 'viewFs backend');

/* 4) 事件：包升级 / 共部署 / 登记包 */
rep(`    // 审计`,
`    // LCM
    $$('[data-pkg-up]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const task = await api('/api/business/packages/' + b.dataset.pkgUp + '/upgrade', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ site: 'site-hz', to_version: b.dataset.pkgVer }),
        });
        S.tasks.unshift(task);
        S.taskSel = task.id;
        S.view = 'task';
      } catch (e) { console.warn(e); }
      render();
    }));
    const coBtn = $('#btnCoDeploy');
    if (coBtn) coBtn.addEventListener('click', async () => {
      try {
        const cur = S.platform ? !!S.platform.co_deploy : false;
        S.platform = await api('/api/business/platform', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ co_deploy: !cur }),
        });
        if (S.lcm) S.lcm.coDeploy = S.platform.co_deploy;
      } catch (e) { console.warn(e); }
      render();
    });

    // 审计`, 'bind lcm');

/* 5) 启动载入 */
rep(`      if (ok) { await loadEndpoint(); await loadElements(); await loadTasks(); await loadIfaces(); await loadAudit(); }`,
    `      if (ok) {
        await loadEndpoint(); await loadElements(); await loadLcm();
        await loadTasks(); await loadIfaces(); await loadAudit();
      }`, 'startup lcm');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
