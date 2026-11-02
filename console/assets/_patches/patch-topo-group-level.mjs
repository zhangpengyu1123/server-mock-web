#!/usr/bin/env node
/* 组级视图：以"选中的组"为中心（2D + 3D），并与层级按钮联动选中组 */
import { readFileSync, writeFileSync } from 'node:fs';
const log = [];
function patch(file, pairs) {
  let t = readFileSync(file, 'utf8');
  for (const [from, to, tag] of pairs) {
    if (!t.includes(from)) { log.push('MISS ' + tag); continue; }
    t = t.split(from).join(to);
    log.push('ok   ' + tag);
  }
  writeFileSync(file, t, 'utf8');
}

/* ---------- 2D：组级 = 站点 → 组 → 组内网元（含人数/站点信息） ---------- */
patch('console/ui/business/plane.js', [
  [`      } else if (S.topoLevel === 'group') {
        mk('site', 360, 24, 170, 40, S.site.name, 'SITE', 'site');
        S.elements.forEach((e, i) => {
          const x = 80 + i * 250;
          mk(e.id, x, 140, 180, 42, e.name, e.type + ' · v' + e.version, 'ne');
          links.push(['site', e.id]);
        });
      } else {`,
`      } else if (S.topoLevel === 'group') {
        // 组视角：站点 → 选中的组 → 组内网元（环形展开）
        const g = S.groups.find((x) => x.id === S.topoSel) || S.groups[0];
        mk('site', 360, 20, 180, 38, S.site.name, 'SITE · ' + S.site.role, 'site');
        if (g) {
          mk(g.id, 360, 110, 200, 44, g.name, 'GROUP · ' + g.elements.length + ' NE · ' + g.site, 'group');
          links.push(['site', g.id]);
          const members = g.elements.map((id) => S.elements.find((e) => e.id === id)).filter(Boolean);
          members.forEach((e, i) => {
            const n = members.length;
            const span = 640;
            const x = n === 1 ? 360 : 40 + (span / (n - 1)) * i;
            mk(e.id, x, 230, 170, 44, e.name, e.type + ' · v' + e.version, 'ne');
            links.push([g.id, e.id]);
          });
        }
        // 右侧：其他组的速览（弱化，仅作上下文）
        S.groups.filter((x) => !g || x.id !== g.id).forEach((x, i) => {
          mk('g-other-' + x.id, 700, 20 + i * 34, 160, 28, x.name, x.elements.length + ' NE', 'group');
        });
      } else {`, '2D group level'],
]);

/* ---------- 3D：组级 = 站点板 + 中心组托板 + 组内网元弧列 ---------- */
{
  const P = 'console/ui/business/plane-topo3d.js';
  let t = readFileSync(P, 'utf8');
  const from = `    const site = this.inst('site') || this.plate(1.55, 0.08, 1.05, 0xeae5e1);`;
  const to = `    // 组视角：站点板在后，选中的组居中，组内网元弧形展开
    if (lvl === 'group') {
      const g = st.groups.find((x) => x.id === st.topoSel) || st.groups[0];
      const siteB = this.inst('site') || this.plate(1.55, 0.08, 1.05, 0xeae5e1);
      siteB.scale.setScalar(0.85);
      siteB.position.set(0, Y, -1.15);
      this.root.add(siteB);
      addPick(siteB, { kind: 'site', id: 'site', label: st.site.name });
      this.addLabel(siteB, st.site.name, 'SITE', 0.26, 0.9, { big: 44, small: 24, tick: '#a67d48' });

      if (g) {
        const tray = this.inst('group') || this.plate(2.05, 0.07, 0.66, 0xe6e1d9);
        tray.position.set(0, Y, 0);
        this.root.add(tray);
        addPick(tray, { kind: 'group', id: g.id, label: g.name });
        this.addLabel(tray, g.name, 'GROUP · ' + g.elements.length + ' NE', 0.30, 1.0, { big: 42, small: 22 });
        this.edge('site', g.id);

        const members = g.elements.map((id) => st.elements.find((e) => e.id === id)).filter(Boolean);
        members.forEach((e, i) => {
          const n = members.length;
          const span = 1.9;
          const x = n === 1 ? 0 : -span / 2 + (span / (n - 1)) * i;
          const mod = this.inst('ne') || this.card(0.34, 0.46, 0.03);
          mod.position.set(x, Y + 0.04, 0.30);
          mod.scale.setScalar(1.15);
          this.root.add(mod);
          addPick(mod, { kind: 'ne', id: e.id, label: e.name });
          if (this.models) this.paintNameplate(mod, e.name, e.version, e.id.toUpperCase());
          this.addLabel(mod, e.name, e.type + ' · v' + e.version, this.models ? 0.58 : 0.34, 1.0,
            { big: 42, small: 22, tick: /5\\.2\\.1/.test(e.version) ? '#a67d48' : null });
          this.edge(g.id, e.id);
        });
      }
      this.controls.target.set(0, Y + 0.12, -0.15);
      this.camera.position.set(3.0, Y + 2.3, 3.4);
      return;
    }

    const site = this.inst('site') || this.plate(1.55, 0.08, 1.05, 0xeae5e1);`;
  if (t.includes(from)) { t = t.replace(from, to); log.push('ok   3D group level'); }
  else log.push('MISS 3D group level');
  writeFileSync(P, t, 'utf8');
}

/* ---------- 层级切换：进 group 级时确保选中的是组 ---------- */
patch('console/ui/business/plane.js', [
  [`      $$('[data-level]').forEach((b) => b.addEventListener('click', () => { S.topoLevel = b.dataset.level;`,
`      $$('[data-level]').forEach((b) => b.addEventListener('click', () => {
        S.topoLevel = b.dataset.level;
        // 进入组级 / 组件级时补齐选中对象
        if (S.topoLevel === 'group' && !String(S.topoSel || '').startsWith('g-')) {
          S.topoSel = (S.groups[0] || {}).id || S.topoSel;
        }
        if (S.topoLevel === 'component' && !S.elements.find((x) => x.id === S.topoSel)) {
          S.topoSel = (S.elements[0] || {}).id || S.topoSel;
        }`, 'level select fix'],
]);

console.log(log.join('\n'));
