#!/usr/bin/env node
/* 三处观感修正
   1) 卡片过曝：材质压暗 + 提粗糙度；主光换到另一侧更高处，避开正面直射
   2) 前缘光流太细：0.014 → 0.022
   3) 热插拔：62mm → 90mm，并带 2.8° 倾斜 */
import { readFileSync, writeFileSync } from 'node:fs';
const log = [];
const rep = (file, from, to, tag) => {
  let t = readFileSync(file, 'utf8');
  const isRe = from instanceof RegExp;
  const hit = isRe ? from.test(t) : t.includes(from);
  if (!hit) { log.push('MISS ' + tag); if (isRe) from.lastIndex = 0; return; }
  t = isRe ? t.replace(from, () => to) : t.split(from).join(to);
  writeFileSync(file, t, 'utf8');
  log.push('ok   ' + tag);
};

const SCENE = 'console/ui/admin/scene.js';
const FX = 'console/ui/admin/effects.js';

/* ---------- 1) 卡片材质压暗（治过曝） ---------- */
rep(SCENE,
`      const root = this.clonePrefab(this.prefabs[kind] || this.prefabs.LCM);
      const bay = board.bays[slot];`,
`      const root = this.clonePrefab(this.prefabs[kind] || this.prefabs.LCM);
      // 卡片材质压暗一档：白卡正对主光时容易过曝，roughness 也抬到 0.62
      root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((mat) => {
          if (mat.color && mat.emissiveIntensity === undefined) mat.color.multiplyScalar(0.93);
          if (mat.roughness !== undefined) mat.roughness = Math.max(0.62, mat.roughness);
          if (mat.metalness !== undefined) mat.metalness = 0;
        });
      });
      const bay = board.bays[slot];`,
'card material');

/* ---------- 1b) 主光换到左后上方，避开近处卡正面 ---------- */
rep(SCENE,
`    const key = new THREE.DirectionalLight(0xfff6ea, 1.12);
    key.position.set(4.2, 5.4, 5.2);`,
`    const key = new THREE.DirectionalLight(0xfff6ea, 1.12);
    key.position.set(-3.4, 6.6, 3.4);          // 左后上方：近处卡面不再被正面直射打爆`,
'key light');

/* ---------- 2) 前缘光流加宽 ---------- */
rep(FX,
`    new THREE.PlaneGeometry(0.42, 0.014),`,
`    new THREE.PlaneGeometry(0.42, 0.022),`,
'flow width');

/* ---------- 3) 热插拔加大 + 倾斜 ---------- */
rep(FX, /const LIFT = 0\.062;/, `const LIFT = 0.090;`, 'lift const');
rep(FX, /st\.lift = 0\.062;/g, `st.lift = LIFT;`, 'lift set');
rep(FX, /st\.lift = Math\.max\(0, st\.lift - dt \* 0\.26\);/, `st.lift = Math.max(0, st.lift - dt * 0.26);`, 'lift decay');
rep(FX,
`      const e = Math.sin((st.lift / 0.062) * Math.PI);   // 上去再回来
      m.root.position.y = m.seatY + e * 0.062;
    } else if (m.root.position.y !== m.seatY) {
      m.root.position.y = m.seatY;
    }`,
`      const e = Math.sin((st.lift / LIFT) * Math.PI);     // 上去再回来
      m.root.position.y = m.seatY + e * LIFT;
      m.root.rotation.z = -e * 0.049;                     // 2.8° 倾斜，像被抽出一点
    } else if (m.root.position.y !== m.seatY) {
      m.root.position.y = m.seatY;
      m.root.rotation.z = 0;
    }`,
'hotplug motion');

/* lift 常量定义（放在状态区） */
rep(FX,
`const clock = new THREE.Clock();`,
`const clock = new THREE.Clock();
const LIFT = 0.090;              // 热插拔上浮高度（90mm）`,
'lift define');

console.log(log.join('\n'));
