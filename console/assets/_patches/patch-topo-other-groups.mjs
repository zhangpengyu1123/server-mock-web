#!/usr/bin/env node
/* 组级：其他组可点（2D 伪 id go-xxx → 真组；3D 增加其他组托盘 + 点击切换焦点） */
import { readFileSync, writeFileSync } from 'node:fs';
const log = [];

/* ---------- plane.js ---------- */
{
  const P = 'console/ui/business/plane.js';
  let t = readFileSync(P, 'utf8');
  const rep = (from, to, tag) => {
    if (!t.includes(from)) { log.push('MISS ' + tag); return; }
    t = t.split(from).join(to);
    log.push('ok   ' + tag);
  };

  rep(`        g.addEventListener('click', () => {
          S.topoSel = g.dataset.node;
          renderTopo();
          renderTopoDetail();
        });`,
`        g.addEventListener('click', () => {
          const raw = g.dataset.node || '';
          // 组级右侧"其他组"是伪 id（go-g-xxx）→ 切到该组
          if (raw.startsWith('go-')) {
            S.topoSel = raw.slice(3);
            S.topoLevel = 'group';
          } else {
            S.topoSel = raw;
          }
          renderTopo();
          renderTopoDetail();
          if (window.PlaneTopo3D && S.topoDim === '3d') window.PlaneTopo3D.rebuild();
        });`, '2D go- click');

  /* 3D 拾取组时：组级下切换焦点并重建 */
  rep(`            (id) => { S.topoSel = id; renderTopoDetail(); },`,
`            (id, data) => {
              S.topoSel = id;
              if (S.topoLevel === 'group' && data && data.kind === 'group') {
                if (window.PlaneTopo3D) window.PlaneTopo3D.rebuild();
              }
              renderTopoDetail();
            },`, '3D onPick group');

  writeFileSync(P, t, 'utf8');
}

/* ---------- plane-topo3d.js：组级增加其他组托盘 ---------- */
{
  const P = 'console/ui/business/plane-topo3d.js';
  let t = readFileSync(P, 'utf8');
  const anchor = `      this.controls.target.set(0, Y + 0.12, -0.15);`;
  if (t.includes(anchor)) {
    const add = `      // 其他组：后排小托盘，可点切换焦点
      const others = st.groups.filter((x) => !g || x.id !== g.id);
      others.forEach((og, i) => {
        const tray = this.inst('group') || this.plate(1.2, 0.06, 0.4, 0xe6e1d9);
        tray.scale.setScalar(0.55);
        tray.position.set(-1.5 + i * 1.5, Y - 0.02, -2.15);
        this.root.add(tray);
        addPick(tray, { kind: 'group', id: og.id, label: og.name });
        this.addLabel(tray, og.name, og.elements.length + ' NE', 0.20, 0.8, { big: 44, small: 24 });
      });

${anchor}`;
    t = t.replace(anchor, add);
    log.push('ok   3D 其他组托盘');
  } else log.push('MISS 3D controls anchor');
  writeFileSync(P, t, 'utf8');
}

console.log(log.join('\n'));
