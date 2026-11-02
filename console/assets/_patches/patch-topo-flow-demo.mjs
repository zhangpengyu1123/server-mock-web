#!/usr/bin/env node
/* ① 3D 拓扑：琥珀连线上跑流动光点 ② 2D 连线虚线流动 ③ 一键演示剧本 */
import { readFileSync, writeFileSync } from 'node:fs';
const log = [];

/* ---------- 3D 流光 ---------- */
{
  const P = 'console/ui/business/plane-topo3d.js';
  let t = readFileSync(P, 'utf8');
  const rep = (from, to, tag) => {
    if (!t.includes(from)) { log.push('MISS ' + tag); return; }
    t = t.split(from).join(to);
    log.push('ok   ' + tag);
  };

  rep(`  edge(idA, idB) {
    const m = this.linkOneshot(this.anchorOf(idA), this.anchorOf(idB));
    if (m) this.links.push({ from: idA, to: idB, mesh: m });
  }`,
`  edge(idA, idB) {
    const a = this.anchorOf(idA), b = this.anchorOf(idB);
    const m = this.linkOneshot(a, b);
    if (!m) return;
    // 流光：沿线往复的小光点
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), glow(0xffc978, 2.6));
    dot.position.set(a[0], a[1], a[2]);
    this.root.add(dot);
    this.links.push({ from: idA, to: idB, mesh: m, dot, a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), phase: Math.random() });
  }`, 'edge dot');

  // 循环里推进光点
  rep(`  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    this.labels.forEach((l) => { if (l.parent) l.quaternion.copy(this.camera.quaternion); });`,
`  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    this.labels.forEach((l) => { if (l.parent) l.quaternion.copy(this.camera.quaternion); });
    // 流光推进（每 3.2s 走完一条线段，错相出发）
    if (this.links && this.links.length) {
      const now = performance.now() / 3200;
      this.links.forEach((l) => {
        if (!l.dot) return;
        const k = ((now + l.phase) % 1);
        const e = k < 0.5 ? k * 2 : (1 - k) * 2;   // 往返
        l.dot.position.lerpVectors(l.a, l.b, e);
        l.dot.material.emissiveIntensity = 1.6 + Math.sin(e * Math.PI) * 1.6;
      });
    }`, 'loop dots');

  writeFileSync(P, t, 'utf8');
}

/* ---------- 2D 连线虚线流动 ---------- */
{
  const P = 'console/ui/business/plane.css';
  let t = readFileSync(P, 'utf8');
  const add = `

/* 2D 拓扑：琥珀连线流动（数据流向） */
#topoSvg path[stroke="#a67d48"],
#topoSvg line[stroke="#a67d48"] {
  stroke-dasharray: 5 4;
  animation: rhineFlow 1.4s linear infinite;
}
@keyframes rhineFlow { to { stroke-dashoffset: -18; } }
`;
  if (!t.includes('rhineFlow')) { t += add; log.push('ok   2D 流光'); }
  else log.push('skip 2D 流光（已存在）');
  writeFileSync(P, t, 'utf8');
}

/* ---------- 一键演示剧本 ---------- */
{
  const P = 'console/ui/business/plane.js';
  let t = readFileSync(P, 'utf8');
  const rep = (from, to, tag) => {
    if (!t.includes(from)) { log.push('MISS ' + tag); return; }
    t = t.split(from).join(to);
    log.push('ok   ' + tag);
  };

  rep(`          <div class="pl-row-end">
            <button class="pl-btn pl-btn--sm" id="btnTaskPurge">清理已完成</button>`,
`          <div class="pl-row-end">
            <button class="pl-btn pl-btn--sm" id="btnTaskDemo">▶ 演示一次完整升级</button>
            <button class="pl-btn pl-btn--sm" id="btnTaskPurge">清理已完成</button>`, 'demo button');

  rep(`    const purge = $('#btnTaskPurge');`,
`    // 演示剧本：建任务 → 自动推进 → 遇到人工确认 3s 后自动点第 1 项 → 到 100%
    const demo = $('#btnTaskDemo');
    if (demo) demo.addEventListener('click', async () => {
      demo.disabled = true;
      demo.textContent = '演示中…';
      try {
        const site = (S.platform && S.platform.site_name) || 'site-hz';
        const t0 = await api('/api/business/tasks', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ site, element_ids: ['ne-0001'], from_version: '5.2.1', to_version: '5.2.2' }),
        });
        S.taskSel = t0.id;
        S.view = 'task';
        render();
        // 轮询：有人工确认待处理 → 2.2s 后自动选第 1 项；100% 结束
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const list = await api('/api/business/tasks');
          S.tasks = list || S.tasks;
          const cur = (S.tasks || []).find((x) => x.id === t0.id);
          if (!cur) break;
          const stage = cur.stages[cur.stage] || {};
          if (stage.human && stage.human.state === 'pending') {
            await new Promise((r) => setTimeout(r, 900));
            await api('/api/business/tasks/' + t0.id + '/human', {
              method: 'POST', headers: headers(), body: JSON.stringify({ option: 0 }),
            });
          }
          render();
          if (cur.progress >= 100) break;
        }
      } catch (e) { console.warn(e); }
      if (demo) { demo.disabled = false; demo.textContent = '▶ 演示一次完整升级'; }
      render();
    });

    const purge = $('#btnTaskPurge');`, 'demo binding');

  writeFileSync(P, t, 'utf8');
}

console.log(log.join('\n'));
