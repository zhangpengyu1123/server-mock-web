#!/usr/bin/env node
/* OMC 页：站点名/角色可编辑并保存；任务创建带上当前站点名 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* OMC 站点区块：改成可编辑 */
rep(`            <dt>站点</dt><dd>\${esc(S.site.name)} · \${esc(S.site.role)}</dd>`,
`            <dt>站点</dt><dd>
              <input id="siteName" value="\${esc((S.platform && S.platform.site_name) || S.site.name)}"
                style="font:inherit;font-size:10px;padding:2px 4px;background:#fff;border:1px solid var(--line-2);width:120px"/>
              <select id="siteRole" style="font:inherit;font-size:10px;padding:2px;background:#fff;border:1px solid var(--line-2);margin-left:4px">
                \${['primary', 'secondary'].map((r) => \`<option\${(((S.platform && S.platform.site_role) || S.site.role) === r) ? ' selected' : ''}>\${r}</option>\`).join('')}
              </select>
              <button class="pl-btn pl-btn--sm" id="btnSiteSave" style="margin-left:6px">保存</button>
            </dd>`, 'omc site editable');

/* 事件 */
rep(`    // LCM · 包升级 → 生成任务`,
`    // OMC · 站点保存
    const siteSave = $('#btnSiteSave');
    if (siteSave) siteSave.addEventListener('click', async () => {
      const name = ($('#siteName') || {}).value || '';
      const role = ($('#siteRole') || {}).value || 'primary';
      try {
        S.platform = await api('/api/business/platform', {
          method: 'PATCH', headers: headers(), body: JSON.stringify({ site_name: name.trim(), site_role: role }),
        });
        S.site = Object.assign({}, S.site, { name: name.trim() || S.site.name, role });
      } catch (e) { console.warn(e); }
      render();
    });

    // LCM · 包升级 → 生成任务`, 'bind site save');

/* 任务创建时用平台站点名 */
rep(`body: JSON.stringify({ site: 'site-hz', element_ids: ['ne-0001', 'ne-0002'], from_version: '5.2.0', to_version: '5.2.1' }),`,
    `body: JSON.stringify({ site: (S.platform && S.platform.site_name) || 'site-hz', element_ids: ['ne-0001', 'ne-0002'], from_version: '5.2.0', to_version: '5.2.1' }),`, 'task site name (omc)');
rep(`body: JSON.stringify({ site: 'site-hz', to_version: b.dataset.pkgVer }),`,
    `body: JSON.stringify({ site: (S.platform && S.platform.site_name) || 'site-hz', to_version: b.dataset.pkgVer }),`, 'task site name (lcm)');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
