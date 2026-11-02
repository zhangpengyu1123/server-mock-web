#!/usr/bin/env node
/* viewFs 接后端配置 + LCM 事件绑定（node 版本，避免 Shell 引号地狱） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let lines = readFileSync(P, 'utf8').split(/\r?\n/);
const log = [];

/* ① viewFs */
const i = lines.findIndex((l) => l.trim() === 'const f = S.fs;');
if (i >= 0) {
  const repl = [
    '    const f = Object.assign({}, S.fs, (S.platform && S.platform.fs) ? {',
    '      cpus: S.platform.fs.cpus,',
    '      sitePrimary: S.platform.fs.site_primary,',
    '      siteSecondary: S.platform.fs.site_secondary,',
    '      platformVersion: S.platform.fs.version,',
    '      verifySteps: S.platform.fs.verify_steps,',
    '      upgrade: S.platform.fs.upgrade_steps,',
    '    } : {});',
  ];
  lines = [...lines.slice(0, i), ...repl, ...lines.slice(i + 1)];
  log.push('ok   viewFs');
} else log.push('MISS viewFs');

/* ② LCM 事件绑定 */
const a = lines.findIndex((l) => l.includes("if (auditRefresh) auditRefresh.addEventListener"));
if (a >= 0) {
  const bind = [
    '',
    '    // LCM · 包升级 → 生成任务',
    "    $$('[data-pkg-up]').forEach((b) => b.addEventListener('click', async () => {",
    '      try {',
    "        const task = await api('/api/business/packages/' + b.dataset.pkgUp + '/upgrade', {",
    "          method: 'POST', headers: headers(),",
    "          body: JSON.stringify({ site: 'site-hz', to_version: b.dataset.pkgVer }),",
    '        });',
    '        S.tasks.unshift(task);',
    '        S.taskSel = task.id;',
    "        S.view = 'task';",
    '      } catch (e) { console.warn(e); }',
    '      render();',
    '    }));',
    '    // LCM · 共部署开关',
    "    const coBtn = $('#btnCoDeploy');",
    "    if (coBtn) coBtn.addEventListener('click', async () => {",
    '      try {',
    '        const cur = S.platform ? !!S.platform.co_deploy : false;',
    "        S.platform = await api('/api/business/platform', {",
    "          method: 'PATCH', headers: headers(), body: JSON.stringify({ co_deploy: !cur }),",
    '        });',
    '        if (S.lcm) S.lcm.coDeploy = S.platform.co_deploy;',
    '      } catch (e) { console.warn(e); }',
    '      render();',
    '    });',
  ];
  lines = [...lines.slice(0, a + 1), ...bind, ...lines.slice(a + 1)];
  log.push('ok   LCM 绑定');
} else log.push('MISS audit anchor');

writeFileSync(P, lines.join('\n'), 'utf8');
console.log(log.join('\n'));
