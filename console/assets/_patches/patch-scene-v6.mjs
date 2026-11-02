#!/usr/bin/env node
/* scene.js 对齐 v6：平躺横插卡 + 朝天插仓 + 45° 机位 + 压曝 */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'console/ui/admin/scene.js';
let t = readFileSync(P, 'utf8');
const log = [];
const rep = (from, to, tag) => {
  const isRe = from instanceof RegExp;
  const hit = isRe ? from.test(t) : t.includes(from);
  if (!hit) { log.push('MISS ' + tag); if (isRe) from.lastIndex = 0; return; }
  t = isRe ? t.replace(from, () => to) : t.split(from).join(to);
  log.push('ok   ' + tag);
};

/* ---------- 1. 几何常量 ---------- */
rep(/const G = \{[\s\S]*?\n\};/, `const G = {
  boardTop: 0.690,         // 板面上表面（leg 0.640 + 板厚 0.050）
  bayCols: 3, bayRows: 2,
  bayPitchX: 0.520, bayPitchY: 0.420,
  bayW: 0.400, bayD: 0.360, bayDepth: 0.026,
  cardSeatY: 0.670,        // 卡落到位时的卡底 y
  insertFrom: 0.46,        // 横插起点（在板前方，正 Z 方向）
  spacing: 2.92,
  boardPlateY: 0.650, boardPlateZ: 0.4812, boardPlateW: 0.86, boardPlateH: 0.074,
  railY: 0.688, railZ: 0.450,
  cardT: 0.016,
};
`, 'G constants');

/* ---------- 2. 相机：斜上 45° ---------- */
rep(`    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.05, 90);
    this.camera.position.set(0.95, 2.15, 7.4);`,
`    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.05, 90);
    this.camera.position.set(2.10, 3.95, 2.75);   // 俯角 ≈ 45°，看卡片顶面与侧面`, 'camera');
rep(`    this.controls.target.set(0, 0.78, 0);`,
    `    this.controls.target.set(-0.10, 0.69, 0);`, 'target');
rep(`    this.controls.minPolarAngle = 0.30;`, `    this.controls.minPolarAngle = 0.18;`, 'polar min');

/* ---------- 3. 曝光 / 泛光 / 雾 ---------- */
rep(`    this.renderer.toneMappingExposure = 1.05;`, `    this.renderer.toneMappingExposure = 0.90;`, 'exposure');
rep(`    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.58, 0.70, 0.80);`,
    `    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.40, 0.55, 0.94);`, 'bloom');
rep(`    this.scene.fog = new THREE.FogExp2(C.haze, 0.038);`,
    `    this.scene.fog = new THREE.FogExp2(C.haze, 0.018);`, 'fog');

/* ---------- 4. 灯光 ---------- */
rep(`    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd2c9c0, 1.15));`,
    `    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc8bfb6, 0.60));`, 'hemi');
rep(`    const key = new THREE.DirectionalLight(0xfff6ea, 2.3);`,
    `    const key = new THREE.DirectionalLight(0xfff6ea, 1.40);`, 'key');
rep(`    const rim = new THREE.DirectionalLight(0xffd7a2, 1.05);`,
    `    const rim = new THREE.DirectionalLight(0xffd7a2, 0.58);`, 'rim');
rep(`    const fill = new THREE.DirectionalLight(0xdbe7ff, 0.5);`,
    `    const fill = new THREE.DirectionalLight(0xdbe7ff, 0.26);`, 'fill');
rep(`    this.bounce = new THREE.PointLight(0xffbf78, 5.0, 8.0, 2.0);
    this.bounce.position.set(0, 0.55, 2.0);`,
`    this.bounce = new THREE.PointLight(0xffbf78, 2.2, 7.0, 2.0);
    this.bounce.position.set(0, 0.60, 1.1);`, 'bounce');

/* ---------- 5. 地面加深 ---------- */
rep(`      new THREE.MeshStandardMaterial({ color: 0xe6e0d9, roughness: 0.88 })`,
    `      new THREE.MeshStandardMaterial({ color: 0xd6cfc7, roughness: 0.9 })`, 'floor');
rep(`      new THREE.MeshStandardMaterial({ color: 0xdbd4cd, roughness: 0.84 }),`,
    `      new THREE.MeshStandardMaterial({ color: 0xc9c1b9, roughness: 0.86 }),`, 'ribs');

/* ---------- 6. 插仓坐标：2 排 × 3 列 ---------- */
rep(`  socketXs() {
    const n = G.socketCount;
    const span = (n - 1) * G.socketPitch;
    const out = [];
    for (let i = 0; i < n; i++) out.push(-span / 2 + i * G.socketPitch);
    return out;
  }`,
`  /** 插仓中心：2 排 × 3 列（与 Blender SPEC 一致） */
  bayCenters() {
    const out = [];
    for (let r = 0; r < G.bayRows; r++) {
      const y = (r - (G.bayRows - 1) / 2) * G.bayPitchY;
      for (let c = 0; c < G.bayCols; c++) {
        const x = (c - (G.bayCols - 1) / 2) * G.bayPitchX;
        out.push({ x, y });
      }
    }
    return out;
  }`, 'bayCenters');

/* ---------- 7. 主板：铭牌/流线位置 ---------- */
rep(`      plate.position.set(-0.55, G.boardPlateY, G.boardPlateZ);`,
    `      plate.position.set(-0.62, G.boardPlateY, G.boardPlateZ);`, 'board plate');
rep(`      ribbon.position.set(0, G.railY, G.railZ);
      ribbon.rotation.x = -0.10;`,
`      ribbon.position.set(0, G.railY, G.railZ);
      ribbon.rotation.x = -Math.PI / 2;      // 平铺在前缘光槽上`, 'ribbon');

/* ---------- 8. 卡片：平躺、水平铭牌、横插 ---------- */
rep(/      const root = this\.clonePrefab\(this\.prefabs\[kind\] \|\| this\.prefabs\.LCM\);\n      root\.position\.set\(board\.xs\[slot\], G\.socketSeatY \+ G\.insertLift, 0\);[\s\S]*?      root\.add\(plate\);/,
`      const root = this.clonePrefab(this.prefabs[kind] || this.prefabs.LCM);
      const bay = board.bays[slot];
      root.position.set(bay.x, G.cardSeatY, G.insertFrom);   // 从板前方横插进来
      root.scale.setScalar(1.05);
      board.root.add(root);

      // 卡面（朝上）的显著铭牌：服务名 + 方法/路径
      const name = mp.name || mp.path || mp.id;
      const tall = kind === 'FS';
      const plateW = tall ? 0.286 : 0.300;
      const plateH = tall ? 0.086 : 0.082;
      const plate = this.makePlate(plateW, plateH,
        [name, String(mp.method || 'GET').toUpperCase() + '  ' + (mp.path || '')],
        { big: 70, code: kind, accent: kind === 'OMC' ? '#3f8f93' : '#d79a44' });
      plate.rotation.x = -Math.PI / 2;                        // 平铺，朝 +Y
      plate.position.set(0, G.cardT + 0.0016, tall ? 0.094 : 0.092);
      root.add(plate);`, 'card seat + flat plate');

/* ---------- 9. 插仓索引与落位 ---------- */
rep(`      const slot = used.get(bi) || 0;
      if (slot >= board.xs.length) return;`,
    `      const slot = used.get(bi) || 0;
      if (slot >= board.bays.length) return;`, 'slot bounds');

rep(`      const board = { id: node.id, node, root, glows, rail, ribbon, xs, index: bi };`,
    `      const board = { id: node.id, node, root, glows, rail, ribbon, bays: this.bayCenters(), index: bi };`, 'board.bays');

/* ---------- 10. 横插动画（沿 +Z → 0） ---------- */
rep(/      const delay = 0\.08 \+ i \* 0\.05;[\s\S]*?m\.root\.position\.y -= settle;/,
`      const delay = 0.08 + i * 0.05;
      const k = Math.max(0, Math.min(1, (this.intro - delay) * 1.45));
      const ease = 1 - Math.pow(1 - k, 3);
      // 横插：从板前方（+Z）推入到 z=0
      m.root.position.z = G.insertFrom * (1 - ease);
      m.root.position.y = m.seatY;
      const settle = Math.sin(Math.min(1, Math.max(0, (k - 0.84) / 0.16)) * Math.PI) * 0.006;
      m.root.position.y -= settle;`, 'insert slide');

/* ---------- 11. 卡片落位高度 ---------- */
rep(`        emitters, glow, plate, seatY: G.socketSeatY,`,
    `        emitters, glow, plate, seatY: G.cardSeatY,`, 'seatY');

writeFileSync(P, t, 'utf8');
console.log(log.join('\n'));
