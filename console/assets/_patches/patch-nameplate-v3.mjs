#!/usr/bin/env node
/* 用"铭牌面网格为父级 + 前后各贴一张"的方式实现卡面铭牌（不依赖 UV 方向） */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/business/plane-topo3d.js';
let t = readFileSync(P, 'utf8');

const start = t.indexOf('  /** 把动态铭牌贴到网元模块的 MAT_TopoPlate 面上');
const endMark = '  /* 程序化回退 */';
const end = t.indexOf(endMark);
if (start < 0 || end < 0) { console.log('MISS range'); process.exit(1); }

const fn = `  /** 卡面铭牌：以 MAT_TopoPlate 面的网格为父级，前后各贴一张（不依赖 UV 朝向） */
  paintNameplate(mod, name, version, code) {
    const tex = nameplateTexture(name, version, code);
    let count = 0;
    mod.traverse((c) => {
      if (!c.isMesh) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      const plateIdx = mats.findIndex((m) => /TopoPlate/i.test(m.name || ''));
      if (plateIdx < 0) return;
      // 该网格的包围盒 → 取最薄的轴作为法线方向
      c.geometry.computeBoundingBox();
      const bb = c.geometry.boundingBox;
      const size = bb.getSize(new THREE.Vector3());
      const axes = [['x', size.x], ['y', size.y], ['z', size.z]].sort((a, b) => a[1] - b[1]);
      const thin = axes[0][0];       // 最薄轴 = 面法线方向
      const dims = axes.slice(1);    // 面内两轴
      const w = dims[0][1] * 0.94;
      const h = dims[1][1] * 0.94;
      const off = axes[0][1] / 2 + 0.0015;
      const center = bb.getCenter(new THREE.Vector3());

      [1, -1].forEach((sign) => {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide })
        );
        plane.position.copy(center);
        if (thin === 'x') { plane.position.x += sign * off; plane.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2; }
        else if (thin === 'y') { plane.position.y += sign * off; plane.rotation.x = sign > 0 ? -Math.PI / 2 : Math.PI / 2; }
        else { plane.position.z += sign * off; if (sign < 0) plane.rotation.y = Math.PI; }
        plane.renderOrder = 7;
        c.add(plane);
        count++;
      });
    });
    return count;
  }

`;
t = t.slice(0, start) + fn + t.slice(end);
writeFileSync(P, t, 'utf8');
console.log('ok   paintNameplate 重写（双面贴 + 轴向自适应）');
