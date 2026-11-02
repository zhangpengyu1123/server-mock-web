#!/usr/bin/env node
/* 视觉调校：压曝、拉近距离、收紧泛光、加深地面 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/admin/scene.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  if (!t.includes(from)) { log.push('MISS ' + tag); return; }
  t = t.split(from).join(to);
  log.push('ok   ' + tag);
};

// 1) 雾更薄、底色略深
rep(`    this.scene.fog = new THREE.FogExp2(C.haze, 0.038);`,
    `    this.scene.fog = new THREE.FogExp2(C.haze, 0.020);`, 'fog');

// 2) 机位：拉近、压低，3/4 看前两块板
rep(`    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.05, 90);
    this.camera.position.set(0.95, 2.15, 7.4);`,
`    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.05, 90);
    this.camera.position.set(2.35, 1.42, 4.35);`, 'camera');

rep(`    this.controls.target.set(0, 0.78, 0);`,
    `    this.controls.target.set(-0.35, 0.80, 0);`, 'controls target');

// 3) 曝光与泛光：白材质最容易过曝，必须收
rep(`    this.renderer.toneMappingExposure = 1.05;`,
    `    this.renderer.toneMappingExposure = 0.92;`, 'exposure');
rep(`    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.58, 0.70, 0.80);`,
    `    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.55, 0.93);`, 'bloom');

// 4) 灯光：整体降一半，保留主光方向感
rep(`    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd2c9c0, 1.15));`,
    `    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc8bfb6, 0.62));`, 'hemi');
rep(`    const key = new THREE.DirectionalLight(0xfff6ea, 2.3);`,
    `    const key = new THREE.DirectionalLight(0xfff6ea, 1.45);`, 'key');
rep(`    const rim = new THREE.DirectionalLight(0xffd7a2, 1.05);`,
    `    const rim = new THREE.DirectionalLight(0xffd7a2, 0.62);`, 'rim');
rep(`    const fill = new THREE.DirectionalLight(0xdbe7ff, 0.5);`,
    `    const fill = new THREE.DirectionalLight(0xdbe7ff, 0.28);`, 'fill');
rep(`    this.bounce = new THREE.PointLight(0xffbf78, 5.0, 8.0, 2.0);
    this.bounce.position.set(0, 0.55, 2.0);`,
`    this.bounce = new THREE.PointLight(0xffbf78, 2.6, 7.0, 2.0);
    this.bounce.position.set(0, 0.62, 1.2);`, 'bounce');

// 5) 地面加深一档，给白件一个可读的背景
rep(`      new THREE.MeshStandardMaterial({ color: 0xe6e0d9, roughness: 0.88 })`,
    `      new THREE.MeshStandardMaterial({ color: 0xd8d1c9, roughness: 0.9 })`, 'floor');
rep(`      new THREE.MeshStandardMaterial({ color: 0xdbd4cd, roughness: 0.84 }),`,
    `      new THREE.MeshStandardMaterial({ color: 0xcdc5bd, roughness: 0.86 }),`, 'ribs');

// 6) 卡片再放大一点，铭牌才读得清
rep(`      root.position.set(board.xs[slot], G.socketSeatY + G.insertLift, 0);
      board.root.add(root);`,
`      root.position.set(board.xs[slot], G.socketSeatY + G.insertLift, 0);
      root.scale.setScalar(1.18);          // 略放大：铭牌在 1600px 宽下仍可读
      board.root.add(root);`, 'card scale');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
