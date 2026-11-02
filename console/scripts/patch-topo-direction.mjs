#!/usr/bin/env node
/* 拓扑方向语义：单向流光（父→子）+ 链路中点小箭头 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.replace(from, to);
  log.push('ok   ' + tag);
};

/* ① edge()：加方向箭头（圆锥，朝向 to） */
rep(`      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), glow(0xffc978, 2.6).clone());
      dot.position.set(a[0], a[1], a[2]);
      this.root.add(dot);
      this.links.push({ from: idA, to: idB, mesh: m, dot, a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), phase: Math.random() });`,
`      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), glow(0xffc978, 2.6).clone());
      dot.position.set(a[0], a[1], a[2]);
      this.root.add(dot);

      // 方向箭头：链路中点的小圆锥，指向子节点（数据上行方向）
      const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
      const dir = new THREE.Vector3().subVectors(vb, va).normalize();
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.022, 0.058, 8),
        glow(0xffc978, 1.2).clone(),
      );
      arrow.position.copy(va).addScaledVector(dir, 0.62).addScaledVector(dir, 0);
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.root.add(arrow);

      this.links.push({
        from: idA, to: idB, mesh: m, dot, arrow,
        a: va, b: vb, phase: Math.random(),
      });`, 'edge arrow');

/* ② loop()：单向推进（到终点回到起点），不再往返 */
rep(`          const dim = this.selected && l.hot === false;
          const k = (((now * (dim ? 0.3 : 1)) + l.phase) % 1);
          const e = k < 0.5 ? k * 2 : (1 - k) * 2;   // 往返
          l.dot.position.lerpVectors(l.a, l.b, e);
          const base = dim ? 0.35 : 1.6;
          l.dot.material.emissiveIntensity = base + Math.sin(e * Math.PI) * base;`,
`          const dim = this.selected && l.hot === false;
          const e = ((now * (dim ? 0.3 : 1)) + l.phase) % 1;   // 单向：父 → 子，到终点重生
          l.dot.position.lerpVectors(l.a, l.b, e);
          const base = dim ? 0.35 : 1.6;
          const fade = Math.sin(e * Math.PI);                  // 两端淡入淡出
          l.dot.material.emissiveIntensity = base * (0.35 + fade * 1.0);`, 'loop one-way');

/* ③ select()：箭头随选中状态明暗 */
rep(`        l.dot.visible = none || hit;
      }`,
`        l.dot.visible = none || hit;
      }
      if (l.arrow) {
        const none = !id;
        l.arrow.material.color.setHex(none ? 0xffc978 : (hit ? 0xffd79a : 0x9a948a));
        l.arrow.material.emissiveIntensity = none ? 1.2 : (hit ? 2.0 : 0.25);
        l.arrow.visible = none || hit;
      }`, 'select arrow');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
